import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type GitToolsState } from "@/lib/native";
import { setLanguage, t } from "@/lib/i18n";
import { GitTools } from "./git-tools";
import { FileGitAction } from "./rollback-files";
import { ConflictEditor } from "./conflict-editor";

vi.mock("@/lib/native", () => ({native: {tools: vi.fn(), toolAction: vi.fn(), compare: vi.fn(), conflict: vi.fn(),tags:vi.fn()}}));
const state: GitToolsState = {reviewToken: "reviewed", head: "a".repeat(40), branch: "main", operation: null, changed: 0, conflicts: 0, stashes: [], reflog: [], remotes: ["origin"], refs: [
  {name: "refs/heads/main", hash: "a".repeat(40), kind: "local", current: true, upstream: "refs/remotes/origin/main"},
  {name: "refs/heads/feature", hash: "b".repeat(40), kind: "local", current: false, upstream: ""},
  {name: "refs/remotes/origin/remote-feature", hash: "c".repeat(40), kind: "remote", current: false, upstream: ""},
]};
const props = {workspaceId: "w", path: "/repo", blocked: false, onBusyChange: vi.fn(), onChanged: vi.fn()};
beforeEach(() => {vi.resetAllMocks(); localStorage.clear(); setLanguage("en"); vi.mocked(native.tools).mockResolvedValue(state); vi.mocked(native.toolAction).mockResolvedValue("Git operation completed.");});
it.each(["en", "fa", "ar", "zh"] as const)("reviews merge direction and sends the reviewed token in %s", async language => {
  setLanguage(language); const user = userEvent.setup(); render(<GitTools {...props} />);
  await user.click(await screen.findByRole("button", {name: "feature"}));
  await user.click(screen.getByRole("button", {name: t("Merge into current")}));
  const dialog = screen.getByRole("dialog"); expect(within(dialog).getByText("main")).toBeInTheDocument();
  expect(native.toolAction).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", {name: t("Merge into current")}));
  await waitFor(() => expect(native.toolAction).toHaveBeenCalledWith("w", "/repo", expect.objectContaining({action: "merge", target: "refs/heads/feature", reviewToken: "reviewed"})));
  await waitFor(() => expect(props.onBusyChange).toHaveBeenLastCalledWith(false));
});
it("prevents deleting the current branch and requires explicit confirmation for another", async () => {
  const user = userEvent.setup(); render(<GitTools {...props} />);
  await user.click(await screen.findByRole("button", {name: "main"}));
  await user.click(screen.getByRole("button",{name:"More actions"}));
  expect(screen.getByRole("menuitem", {name: "Delete branch"})).toHaveAttribute("data-disabled");
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", {name: "feature"}));
  await user.click(screen.getByRole("button",{name:"More actions"}));
  await user.click(screen.getByRole("menuitem", {name: "Delete branch"}));
  expect(native.toolAction).not.toHaveBeenCalled();
  await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Cancel"}));
  expect(native.toolAction).not.toHaveBeenCalled();
});
it("creates a tracking branch from the selected remote", async () => {
  const user = userEvent.setup(); render(<GitTools {...props} />);
  await user.click(await screen.findByRole("button",{name:/^Remote branches/}));
  await user.click(screen.getByRole("button", {name: "origin/remote-feature"}));
  await user.click(screen.getByRole("button", {name: "Checkout"}));
  const dialog = screen.getByRole("dialog"); expect(within(dialog).getByLabelText("Branch name")).toHaveValue("remote-feature");
  await user.click(within(dialog).getByRole("button", {name: "Checkout"}));
  await waitFor(() => expect(native.toolAction).toHaveBeenCalledWith("w", "/repo", expect.objectContaining({action: "checkout", target: "refs/remotes/origin/remote-feature", name: "remote-feature"})));
});
it("refreshes after a stale-review rejection without retrying the operation automatically", async () => {
  vi.mocked(native.toolAction).mockRejectedValue("Repository changed. Refresh and review the operation again.");
  const user = userEvent.setup(); render(<GitTools {...props} />);
  await user.click(await screen.findByRole("button", {name: "feature"})); await user.click(screen.getByRole("button",{name:"More actions"})); await user.click(screen.getByRole("menuitem", {name: "Delete branch"}));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Delete branch"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Repository changed");
  await waitFor(() => expect(native.tools).toHaveBeenCalledTimes(2)); expect(native.toolAction).toHaveBeenCalledTimes(1);
});
it("rolls back only the file selection captured for review", async () => {
  const user = userEvent.setup(); const view = render(<FileGitAction {...props} action="rollback" paths={["first.txt"]} />);
  await user.click(screen.getByRole("button", {name: "Rollback selected"}));
  await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", {name: "Rollback selected"})).toBeEnabled());
  view.rerender(<FileGitAction {...props} action="rollback" paths={["second.txt"]} />);
  await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Rollback selected"}));
  await waitFor(() => expect(native.toolAction).toHaveBeenCalledWith("w", "/repo", expect.objectContaining({paths: ["first.txt"], reviewToken: "reviewed"})));
});
it("requires conflict markers to be removed and saves the reviewed three-way result", async () => {
  vi.mocked(native.conflict).mockResolvedValue({base: "base\n", ours: "ours\n", theirs: "theirs\n", working: "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\n", reviewToken: "conflict-review"});
  const user = userEvent.setup(); render(<ConflictEditor {...props} file="file.txt" />);
  await user.click(screen.getByRole("button", {name: "Edit conflict"}));
  const result = await screen.findByLabelText("Merged result");
  expect(screen.getByRole("button", {name: "Save and mark resolved"})).toBeDisabled();
  fireEvent.change(result, {target: {value: "combined\n"}});
  await user.click(screen.getByRole("button", {name: "Save and mark resolved"}));
  await waitFor(() => expect(native.toolAction).toHaveBeenCalledWith("w", "/repo", expect.objectContaining({action: "resolve-edit", paths: ["file.txt"], name: "combined\n", reviewToken: "conflict-review"})));
});

it("opens on the current branch and keeps utilities and dangerous actions off the daily toolbar",async()=>{
 const user=userEvent.setup();render(<GitTools {...props}/>);const current=await screen.findByRole("button",{name:"main"});
 await waitFor(()=>expect(current).toHaveAttribute("aria-pressed","true"));expect(screen.getByText("You are working on this branch.")).toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"Delete branch"})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Checkout"})).not.toBeInTheDocument();expect(screen.queryByRole("tab")).not.toBeInTheDocument();
 await user.click(screen.getByRole("button",{name:"Repository tools"}));for(const name of ["Shelf","Stashes","Tags","Remotes","Submodules","Recovery and history"])expect(screen.getByRole("menuitem",{name})).toBeInTheDocument();expect(native.toolAction).not.toHaveBeenCalled();
});
it("search reveals matching remote branches without a manual expand step",async()=>{
 const user=userEvent.setup();render(<GitTools {...props}/>);const search=await screen.findByRole("textbox",{name:"Search branches"});
 await waitFor(()=>expect(screen.getByRole("button",{name:/^Remote branches/})).toHaveAttribute("aria-expanded","false"));expect(screen.queryByRole("button",{name:"origin/remote-feature"})).not.toBeInTheDocument();
 await user.type(search,"remote-feature");expect(screen.getByRole("button",{name:"origin/remote-feature"})).toBeVisible();expect(screen.getByRole("button",{name:/^Remote branches/})).toHaveAttribute("aria-expanded","true");
 await user.clear(search);expect(screen.queryByRole("button",{name:"origin/remote-feature"})).not.toBeInTheDocument();expect(native.toolAction).not.toHaveBeenCalled();
});
it("moves recovery references out of branches and keeps reviewed restoration accessible",async()=>{
 vi.mocked(native.tools).mockResolvedValue({...state,refs:[...state.refs,{name:"refs/tags/v1",kind:"tag",hash:"d".repeat(40),upstream:"",current:false},{name:"refs/gitorbit/recovery/saved",kind:"recovery",hash:"e".repeat(40),upstream:"",current:false}]});
 const user=userEvent.setup();render(<GitTools {...props}/>);await screen.findByRole("button",{name:"main"});expect(screen.queryByText("v1")).not.toBeInTheDocument();expect(screen.queryByText("saved")).not.toBeInTheDocument();
 await user.click(screen.getByRole("button",{name:"Repository tools"}));await user.click(screen.getByRole("menuitem",{name:"Recovery and history"}));
 await user.click(screen.getByRole("button",{name:"Actions for saved"}));await user.click(screen.getByRole("menuitem",{name:"Restore as branch"}));
 expect(within(screen.getByRole("dialog")).getByText("saved")).toBeInTheDocument();expect(native.toolAction).not.toHaveBeenCalled();await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Cancel"}));
 await user.click(screen.getByRole("button",{name:"Branches"}));expect(screen.getByRole("textbox",{name:"Search branches"})).toBeInTheDocument();
});

it("keeps local tag deletion in the Tags tool with an explicit reviewed target",async()=>{
 vi.mocked(native.tags).mockResolvedValue({reviewToken:"tags",tags:[{name:"v1",objectId:"d".repeat(40),commitId:"d".repeat(40),annotated:false,subject:"Release"}],remotes:["origin"]});
 const user=userEvent.setup();render(<GitTools {...props}/>);await screen.findByRole("button",{name:"main"});await user.click(screen.getByRole("button",{name:"Repository tools"}));await user.click(screen.getByRole("menuitem",{name:"Tags"}));await user.click(await screen.findByRole("button",{name:"Actions for v1"}));await user.click(screen.getByRole("menuitem",{name:"Delete tag"}));
 expect(within(screen.getByRole("dialog")).getByText("v1")).toBeInTheDocument();expect(native.toolAction).not.toHaveBeenCalled();await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Delete tag"}));await waitFor(()=>expect(native.toolAction).toHaveBeenCalledWith("w","/repo",expect.objectContaining({action:"delete-tag",target:"refs/tags/v1",reviewToken:"reviewed"})));
});

it("closes a branch comparison without losing the selection or writing to Git",async()=>{
 vi.mocked(native.compare).mockResolvedValue({target:"refs/heads/feature",ahead:2,behind:1,diff:"@@ -1 +1 @@\n-old\n+new",truncated:false});
 const user=userEvent.setup();render(<GitTools {...props}/>);await user.click(await screen.findByRole("button",{name:"feature"}));await user.click(screen.getByRole("button",{name:"Compare with current"}));
 await user.click(await screen.findByRole("button",{name:"Close comparison"}));expect(screen.queryByLabelText("Side-by-side diff")).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"feature"})).toHaveAttribute("aria-pressed","true");expect(native.toolAction).not.toHaveBeenCalled();expect(native.compare).toHaveBeenCalledWith("w","/repo","refs/heads/feature");
});
