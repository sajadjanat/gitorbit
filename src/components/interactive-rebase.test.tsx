import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type RebaseInfo } from "@/lib/native";
import { setLanguage, t } from "@/lib/i18n";
import { InteractiveRebase } from "./interactive-rebase";
vi.mock("@/lib/native", () => ({native: {interactiveRebase: vi.fn(), startInteractiveRebase: vi.fn()}}));
const info: RebaseInfo = {reviewToken:"reviewed",head:"b".repeat(40),base:"0".repeat(40),commits:[{hash:"a".repeat(40),subject:"First",message:"First\n\nBody"},{hash:"b".repeat(40),subject:"Second",message:"Second"}],blockedReason:null,published:false,shallow:false};
const props = {workspaceId:"w",path:"/repo",blocked:false,onChanged:vi.fn(),onBusyChange:vi.fn()};
beforeEach(() => {vi.resetAllMocks();localStorage.clear();setLanguage("en");vi.mocked(native.interactiveRebase).mockResolvedValue(info);vi.mocked(native.startInteractiveRebase).mockResolvedValue("Interactive rebase completed. Review outgoing commits before pushing.");});
async function open(user: ReturnType<typeof userEvent.setup>) {render(<InteractiveRebase {...props} />);await user.click(screen.getByRole("button",{name:t("Interactive rebase")}));await screen.findByText("First");}
async function action(user: ReturnType<typeof userEvent.setup>, hash: string, label: string) {await user.click(screen.getByRole("combobox",{name:t("Action for {hash}",{hash:hash.repeat(8)})}));await user.click(await screen.findByRole("option",{name:t(label)}));}
it.each(["en","fa","ar","zh"] as const)("reviews reordered reword steps without writing until start in %s",async language => {
  setLanguage(language);const user=userEvent.setup();await open(user);
  await action(user,"a","Edit message");
  const message = screen.getByRole("textbox",{name:t("Message for {hash}",{hash:"a".repeat(8)})});expect(message).toHaveValue("First\n\nBody");
  fireEvent.change(message,{target:{value:"New subject\n\nNew body"}});
  await user.click(screen.getByRole("button",{name:t("Move {hash} down",{hash:"a".repeat(8)})}));
  expect(native.startInteractiveRebase).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:t("Start interactive rebase")}));
  await waitFor(() => expect(native.startInteractiveRebase).toHaveBeenCalledWith("w","/repo",{reviewToken:"reviewed",base:info.base,allowPublished:false,steps:[{hash:"b".repeat(40),action:"pick",message:"Second"},{hash:"a".repeat(40),action:"reword",message:"New subject\n\nNew body"}]}));
});
it("requires an acknowledgement for published commits",async () => {
  vi.mocked(native.interactiveRebase).mockResolvedValue({...info,published:true});const user=userEvent.setup();await open(user);
  expect(screen.getByRole("button",{name:"Start interactive rebase"})).toBeDisabled();
  await user.click(screen.getByRole("checkbox",{name:"I understand this rewrites published history"}));
  await user.click(screen.getByRole("button",{name:"Start interactive rebase"}));
  await waitFor(() => expect(native.startInteractiveRebase).toHaveBeenCalledWith("w","/repo",expect.objectContaining({allowPublished:true})));
});
it("prevents starting with a first squash or with all commits dropped",async () => {
  const user=userEvent.setup();await open(user);await action(user,"a","Squash into previous");
  expect(screen.getByRole("button",{name:"Start interactive rebase"})).toBeDisabled();
  await action(user,"a","Drop commit");await action(user,"b","Drop commit");
  expect(screen.getByRole("button",{name:"Start interactive rebase"})).toBeDisabled();expect(native.startInteractiveRebase).not.toHaveBeenCalled();
});
it("invalidates the reviewed plan when the base changes",async () => {
  const user=userEvent.setup();await open(user);
  fireEvent.change(screen.getByRole("textbox",{name:"Base revision"}),{target:{value:"HEAD~2"}});
  expect(screen.queryByText("First")).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Start interactive rebase"})).toBeDisabled();
  await user.click(screen.getByRole("button",{name:"Load commits"}));
  await waitFor(() => expect(native.interactiveRebase).toHaveBeenLastCalledWith("w","/repo","HEAD~2"));
});
it("shows unsafe repository state without allowing a mutation",async () => {
  vi.mocked(native.interactiveRebase).mockResolvedValue({...info,commits:[],blockedReason:"Commit or stash local changes before rebasing."});
  const user=userEvent.setup();render(<InteractiveRebase {...props} />);await user.click(screen.getByRole("button",{name:"Interactive rebase"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Commit or stash");expect(screen.getByRole("button",{name:"Start interactive rebase"})).toBeDisabled();
});
it("displays stale/conflict errors and requires a fresh review instead of retrying",async () => {
  vi.mocked(native.startInteractiveRebase).mockRejectedValue("Repository changed. Refresh and review the operation again.");
  const user=userEvent.setup();await open(user);await user.click(screen.getByRole("button",{name:"Start interactive rebase"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Repository changed");
  expect(screen.getByRole("button",{name:"Start interactive rebase"})).toBeDisabled();expect(native.startInteractiveRebase).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button",{name:"Load commits"}));await screen.findByText("First");
  expect(screen.getByRole("button",{name:"Start interactive rebase"})).toBeEnabled();
});
it("cancels without mutating the repository",async () => {
  const user=userEvent.setup();await open(user);await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Cancel"}));expect(native.startInteractiveRebase).not.toHaveBeenCalled();
});
