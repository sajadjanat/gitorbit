import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native } from "@/lib/native";
import { setLanguage, t } from "@/lib/i18n";
import { IgnoreFiles, ShowIgnored } from "./ignored-files";
vi.mock("@/lib/native", () => ({native: {ignoreFilesReview:vi.fn(),ignoreFilesApply:vi.fn(),ignoredFiles:vi.fn()}}));
const props = {workspaceId:"w",path:"/repo",paths:["[cache].log"],onChanged:vi.fn(),onBusyChange:vi.fn()};
beforeEach(() => {vi.resetAllMocks();localStorage.clear();setLanguage("en");vi.mocked(native.ignoreFilesReview).mockImplementation(async (_w,_p,paths,target) => ({reviewToken:`review-${target}`,target,paths,patterns:paths.map(() => "/\\[cache\\].log")}));vi.mocked(native.ignoreFilesApply).mockResolvedValue("Ignore rules saved. Existing tracked files are unchanged.");vi.mocked(native.ignoredFiles).mockResolvedValue({files:["cache/private.log"],hasMore:false});});
it.each(["en","fa","ar","zh"] as const)("reviews exact patterns before saving in %s",async language => {
  setLanguage(language);const user=userEvent.setup();render(<IgnoreFiles {...props} />);await user.click(screen.getByRole("button",{name:t("Ignore selected")}));
  expect(await screen.findByText("/\\[cache\\].log")).toBeInTheDocument();expect(native.ignoreFilesApply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:t("Save ignore rules")}));
  await waitFor(() => expect(native.ignoreFilesApply).toHaveBeenCalledWith("w","/repo",{reviewToken:"review-shared",target:"shared",paths:["[cache].log"]}));
  expect(props.onChanged).toHaveBeenCalledTimes(1);
});
it("reviews local rules separately and preserves explicit target",async () => {
  const user=userEvent.setup();render(<IgnoreFiles {...props} />);await user.click(screen.getByRole("button",{name:"Ignore selected"}));await screen.findByText("/\\[cache\\].log");
  await user.click(screen.getByRole("combobox",{name:"Ignore rules location"}));await user.click(screen.getByRole("option",{name:"Only this clone · .git/info/exclude"}));
  await waitFor(() => expect(native.ignoreFilesReview).toHaveBeenLastCalledWith("w","/repo",["[cache].log"],"local"));
  await user.click(screen.getByRole("button",{name:"Save ignore rules"}));
  await waitFor(() => expect(native.ignoreFilesApply).toHaveBeenCalledWith("w","/repo",expect.objectContaining({target:"local",reviewToken:"review-local"})));
});
it("shows stale failures and requires a fresh review instead of retrying",async () => {
  vi.mocked(native.ignoreFilesApply).mockRejectedValue("Repository changed. Refresh and review the operation again.");
  const user=userEvent.setup();render(<IgnoreFiles {...props} />);await user.click(screen.getByRole("button",{name:"Ignore selected"}));await screen.findByText("/\\[cache\\].log");await user.click(screen.getByRole("button",{name:"Save ignore rules"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Repository changed");expect(screen.getByRole("button",{name:"Save ignore rules"})).toBeDisabled();expect(native.ignoreFilesApply).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button",{name:"Refresh"}));await waitFor(() => expect(screen.getByRole("button",{name:"Save ignore rules"})).toBeEnabled());
});
it("cancels without a write and disables an empty selection",async () => {
  const user=userEvent.setup();const view=render(<IgnoreFiles {...props} />);await user.click(screen.getByRole("button",{name:"Ignore selected"}));await screen.findByText("/\\[cache\\].log");await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Cancel"}));
  expect(native.ignoreFilesApply).not.toHaveBeenCalled();view.rerender(<IgnoreFiles {...props} paths={[]} />);expect(screen.getByRole("button",{name:"Ignore selected"})).toBeDisabled();
});
it("shows inventory limits explicitly",async () => {
  vi.mocked(native.ignoredFiles).mockResolvedValue({files:["cache/private.log"],hasMore:true});const user=userEvent.setup();render(<ShowIgnored workspaceId="w" path="/repo" />);await user.click(screen.getByRole("button",{name:"Show ignored files"}));
  expect(await screen.findByText("cache/private.log")).toBeInTheDocument();expect(screen.getByRole("alert")).toHaveTextContent("first 2000");
});
it("displays inventory errors without claiming no ignored files",async () => {
  vi.mocked(native.ignoredFiles).mockRejectedValue("Git read failed");const user=userEvent.setup();render(<ShowIgnored workspaceId="w" path="/repo" />);await user.click(screen.getByRole("button",{name:"Show ignored files"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Git read failed");expect(screen.queryByText("No ignored untracked files were found.")).not.toBeInTheDocument();
  vi.mocked(native.ignoredFiles).mockResolvedValue({files:[],hasMore:false});await user.click(screen.getByRole("button",{name:"Refresh"}));expect(await screen.findByText("No ignored untracked files were found.")).toBeInTheDocument();
});
