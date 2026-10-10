import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type CommitOptionsInfo, type Repository } from "@/lib/native";
import { setLanguage, t } from "@/lib/i18n";
import { VersionControl } from "./version-control";

vi.mock("@/lib/native", () => ({native: {changes: vi.fn(), diff: vi.fn(), action: vi.fn(), commitOptions: vi.fn(), commitReviewed: vi.fn(), outgoing: vi.fn(), push: vi.fn(), tools:vi.fn(),toolAction:vi.fn(),shelves:vi.fn(),shelfAction:vi.fn(),deleteFilesReview:vi.fn(),deleteFiles:vi.fn()}}));
const repository: Repository = {path: "/repo", name: "repo", branch: "main", upstream: "origin/main", changed: 0, staged: 0, unstaged: 0, untracked: 0, conflicts: 0, ahead: 0, behind: 0, detached: false, files: [], error: null, fetchError: null};
const info: CommitOptionsInfo = {reviewToken: "reviewed", head: "a".repeat(40), previousMessage: "Previous subject\n\nFull previous body", canAmend: true, blockedReason: null, staged: 0, published: true, signOffIdentity: "Test <test@example.com>",defaultAuthorName:"Current Author",defaultAuthorEmail:"current@example.com",previousAuthorName:"Original Author",previousAuthorEmail:"original@example.com",signingEnabled:false,signingFormat:"openpgp",signingKey:null};
const props = {workspaceId: "w", path: "/repo", blocked: false, onBusyChange: vi.fn(), onChanged: vi.fn()};
beforeEach(() => {vi.resetAllMocks(); localStorage.clear(); setLanguage("en"); vi.mocked(native.changes).mockResolvedValue(repository); vi.mocked(native.commitOptions).mockResolvedValue(info); vi.mocked(native.commitReviewed).mockResolvedValue("Amended commit abcdef.");});
async function option(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", {name: t("Commit options")}));
  await user.click(await screen.findByRole("menuitemcheckbox", {name: t(name)}));
}
it.each(["en", "fa", "ar", "zh"] as const)("reviews message-only amend and shared history in %s", async (language) => {
  setLanguage(language); const user = userEvent.setup(); render(<VersionControl {...props} />);
  await waitFor(() => expect(native.commitOptions).toHaveBeenCalled());
  await option(user, "Amend last commit");
  expect(screen.getByRole("textbox")).toHaveValue(info.previousMessage);
  expect(screen.getByRole("button", {name: t("Commit and Push…")})).toBeDisabled();
  await user.click(screen.getByRole("button", {name: t("Amend commit…")}));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(info.head)).toBeInTheDocument();
  expect(within(dialog).getByText(t("This commit exists in a remote-tracking branch. Amending rewrites shared history. Coordinate with collaborators; GitOrbit will not force-push it."))).toBeInTheDocument();
  expect(native.commitReviewed).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", {name: t("Amend commit")}));
  await waitFor(() => expect(native.commitReviewed).toHaveBeenCalledWith("w", "/repo", {reviewToken: "reviewed", message: info.previousMessage, amend: true, signOff: false}));
  expect(native.push).not.toHaveBeenCalled();
});
it("keeps a draft when enabling amend and sends explicit sign-off", async () => {
  const user = userEvent.setup(); render(<VersionControl {...props} />);
  const textbox = screen.getByRole("textbox"); fireEvent.change(textbox, {target: {value: "My existing draft"}});
  await option(user, "Amend last commit");
  expect(textbox).toHaveValue("My existing draft");
  await option(user, "Add Signed-off-by");
  expect(screen.getByText(info.signOffIdentity!)).toBeInTheDocument();
  await user.click(screen.getByRole("button", {name: "Amend commit…"}));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Amend commit"}));
  await waitFor(() => expect(native.commitReviewed).toHaveBeenCalledWith("w", "/repo", expect.objectContaining({message: "My existing draft", signOff: true})));
});
it("cancels amend without writing and retains the message", async () => {
  const user = userEvent.setup(); render(<VersionControl {...props} />);
  await option(user, "Amend last commit");
  await user.click(screen.getByRole("button", {name: "Amend commit…"}));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Cancel"}));
  expect(native.commitReviewed).not.toHaveBeenCalled(); expect(screen.getByRole("textbox")).toHaveValue(info.previousMessage);
});
it("rejects stale review without retry and keeps the draft", async () => {
  vi.mocked(native.commitReviewed).mockRejectedValue("Repository changed. Refresh and review the operation again.");
  const user = userEvent.setup(); render(<VersionControl {...props} />);
  await option(user, "Amend last commit"); await user.click(screen.getByRole("button", {name: "Amend commit…"}));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Amend commit"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Repository changed");
  await waitFor(() => expect(native.commitOptions).toHaveBeenCalledTimes(2));
  expect(native.commitReviewed).toHaveBeenCalledTimes(1); expect(screen.getByRole("textbox")).toHaveValue(info.previousMessage);
});
it("disables amend for unsafe state and normal commit without staged files", async () => {
  vi.mocked(native.commitOptions).mockResolvedValue({...info, canAmend: false, blockedReason: "Select a branch before amending."});
  const user = userEvent.setup(); render(<VersionControl {...props} />);
  fireEvent.change(screen.getByRole("textbox"), {target: {value: "Draft"}});
  await user.click(screen.getByRole("button", {name: "Commit options"}));
  expect(await screen.findByRole("menuitemcheckbox", {name: "Amend last commit"})).toHaveAttribute("data-disabled");
  await user.keyboard("{Escape}"); expect(screen.getByRole("button", {name: "Commit"})).toBeDisabled();
});
it("commits staged files with reviewed sign-off without amending", async () => {
  vi.mocked(native.changes).mockResolvedValue({...repository, changed: 1, staged: 1, files: [{path: "file.txt", originalPath: null, status: "M "}]});
  vi.mocked(native.commitOptions).mockResolvedValue({...info, staged: 1});
  const user = userEvent.setup(); render(<VersionControl {...props} />);
  await option(user, "Add Signed-off-by"); fireEvent.change(screen.getByRole("textbox"), {target: {value: "New commit"}});
  await user.click(screen.getByRole("button", {name: "Commit"}));
  await waitFor(() => expect(native.commitReviewed).toHaveBeenCalledWith("w", "/repo", {reviewToken: "reviewed", message: "New commit", amend: false, signOff: true}));
  expect(native.action).not.toHaveBeenCalled();
});
it("prefills an opt-in custom amend author and sends a per-commit signing override",async()=>{
  const user=userEvent.setup();render(<VersionControl {...props}/>);await option(user,"Amend last commit");await option(user,"Custom commit author");
  expect(screen.getByRole("textbox",{name:"Author name"})).toHaveValue("Original Author");expect(screen.getByRole("textbox",{name:"Author email"})).toHaveValue("original@example.com");
  fireEvent.change(screen.getByRole("textbox",{name:"Author name"}),{target:{value:"New Author"}});fireEvent.change(screen.getByRole("textbox",{name:"Author email"}),{target:{value:"new@example.com"}});
  await user.click(screen.getByRole("button",{name:"Commit options"}));await user.click(screen.getByRole("menuitemradio",{name:"Do not sign this commit"}));
  await user.click(screen.getByRole("button",{name:"Amend commit…"}));const dialog=screen.getByRole("dialog");expect(within(dialog).getByText("New Author <new@example.com>")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button",{name:"Amend commit"}));await waitFor(()=>expect(native.commitReviewed).toHaveBeenCalledWith("w","/repo",expect.objectContaining({author:{name:"New Author",email:"new@example.com"},sign:false})));
});
it("blocks invalid author input without attempting a commit",async()=>{
  const user=userEvent.setup();render(<VersionControl {...props}/>);await option(user,"Amend last commit");await option(user,"Custom commit author");fireEvent.change(screen.getByRole("textbox",{name:"Author email"}),{target:{value:"bad email"}});
  expect(screen.getByRole("button",{name:"Amend commit…"})).toBeDisabled();expect(native.commitReviewed).not.toHaveBeenCalled();
});
it.each(["en","fa","ar","zh"] as const)("keeps secondary file actions collapsed and accessible in %s",async language=>{
  setLanguage(language);const user=userEvent.setup();render(<VersionControl {...props}/>);const more=screen.getByRole("button",{name:t("More file actions")});expect(more).toHaveAttribute("aria-expanded","false");expect(screen.queryByRole("button",{name:t("Show ignored files")})).not.toBeInTheDocument();
  await user.click(more);expect(more).toHaveAttribute("aria-expanded","true");expect(screen.getByRole("button",{name:t("Show ignored files")})).toBeInTheDocument();await user.click(more);expect(screen.queryByRole("button",{name:t("Show ignored files")})).not.toBeInTheDocument();
});

it("right-click stages the clicked file rather than another checked file",async()=>{
  vi.mocked(native.changes).mockResolvedValue({...repository,changed:2,unstaged:2,files:[{path:"one.ts",originalPath:null,status:" M"},{path:"two.ts",originalPath:null,status:" M"}]});
  const user=userEvent.setup();render(<VersionControl {...props}/>);await user.click(await screen.findByRole("checkbox",{name:"Select changes one.ts"}));
  fireEvent.contextMenu(screen.getByTitle("two.ts"));await user.click(await screen.findByRole("menuitem",{name:"Stage selected"}));
  await waitFor(()=>expect(native.action).toHaveBeenCalledWith("w","/repo","stage",["two.ts"],null));
});
it("right-click on a checked file uses the current same-group selection",async()=>{
  vi.mocked(native.changes).mockResolvedValue({...repository,changed:2,unstaged:2,files:[{path:"one.ts",originalPath:null,status:" M"},{path:"two.ts",originalPath:null,status:" M"}]});
  const user=userEvent.setup();render(<VersionControl {...props}/>);await user.click(await screen.findByRole("checkbox",{name:"Select changes one.ts"}));await user.click(screen.getByRole("checkbox",{name:"Select changes two.ts"}));
  fireEvent.contextMenu(screen.getByTitle("two.ts"));expect(await screen.findByRole("menuitem",{name:"Delete files"})).toBeInTheDocument();expect(screen.queryByRole("menuitem",{name:"Delete file"})).not.toBeInTheDocument();await user.click(screen.getByRole("menuitem",{name:"Stage selected"}));await waitFor(()=>expect(native.action).toHaveBeenCalledWith("w","/repo","stage",["one.ts","two.ts"],null));
});
it("reviews the exact right-clicked paths before rollback",async()=>{
  vi.mocked(native.changes).mockResolvedValue({...repository,changed:2,unstaged:2,files:[{path:"one.ts",originalPath:null,status:" M"},{path:"two.ts",originalPath:null,status:" M"}]});
  vi.mocked(native.tools).mockResolvedValue({reviewToken:"rollback-review",head:info.head,branch:"main",operation:null,changed:2,conflicts:0,refs:[],stashes:[],reflog:[],remotes:[]});
  const user=userEvent.setup();render(<VersionControl {...props}/>);await screen.findByTitle("two.ts");fireEvent.contextMenu(screen.getByTitle("two.ts"));await user.click(await screen.findByRole("menuitem",{name:"Rollback selected"}));
  const dialog=screen.getByRole("dialog");await waitFor(()=>expect(within(dialog).getByRole("button",{name:"Rollback selected"})).toBeEnabled());expect(within(dialog).getByText("two.ts")).toBeInTheDocument();expect(within(dialog).queryByText("one.ts")).not.toBeInTheDocument();expect(native.toolAction).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button",{name:"Rollback selected"}));await waitFor(()=>expect(native.toolAction).toHaveBeenCalledWith("w","/repo",expect.objectContaining({action:"rollback",paths:["two.ts"],reviewToken:"rollback-review"})));
});
it("offers shelving but does not offer tracked rollback for a new file",async()=>{
  vi.mocked(native.changes).mockResolvedValue({...repository,changed:1,untracked:1,files:[{path:"new.ts",originalPath:null,status:"??"}]});render(<VersionControl {...props}/>);await screen.findByTitle("new.ts");fireEvent.contextMenu(screen.getByTitle("new.ts"));expect(await screen.findByRole("menuitem",{name:"Shelve selected…"})).toBeInTheDocument();expect(screen.queryByRole("menuitem",{name:"Rollback selected"})).not.toBeInTheDocument();
});

it.each([" M","??"])("deletes the right-clicked %s file only after review and refreshes the list",async status=>{
  vi.mocked(native.changes).mockResolvedValue({...repository,changed:2,files:[{path:"one.ts",originalPath:null,status},{path:"two.ts",originalPath:null,status}]});
  vi.mocked(native.deleteFilesReview).mockResolvedValue({reviewToken:"delete-review",paths:["two.ts"]});vi.mocked(native.deleteFiles).mockResolvedValue("Selected files deleted. Review and stage tracked deletions when ready.");
  const user=userEvent.setup();render(<VersionControl {...props}/>);await user.click(await screen.findByRole("checkbox",{name:`Select ${status==="??"?"unversioned":"changes"} one.ts`}));
  fireEvent.contextMenu(screen.getByTitle("two.ts"));await user.click(await screen.findByRole("menuitem",{name:"Delete file"}));
  const dialog=screen.getByRole("dialog");await waitFor(()=>expect(within(dialog).getByRole("button",{name:"Delete file"})).toBeEnabled());
  expect(native.deleteFilesReview).toHaveBeenCalledWith("w","/repo",["two.ts"]);expect(native.deleteFiles).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button",{name:"Delete file"}));await waitFor(()=>expect(native.changes).toHaveBeenCalledTimes(2));
  expect(native.deleteFiles).toHaveBeenCalledWith("w","/repo",{reviewToken:"delete-review",paths:["two.ts"]});
});
it("disables delete for an already missing file and exposes selected deletion under More file actions",async()=>{
  vi.mocked(native.changes).mockResolvedValue({...repository,changed:2,files:[{path:"gone.ts",originalPath:null,status:" D"},{path:"new.ts",originalPath:null,status:"??"}]});
  const user=userEvent.setup();render(<VersionControl {...props}/>);await screen.findByTitle("gone.ts");fireEvent.contextMenu(screen.getByTitle("gone.ts"));
  expect(await screen.findByRole("menuitem",{name:"Delete file"})).toHaveAttribute("data-disabled");await user.keyboard("{Escape}");
  await user.click(screen.getByRole("checkbox",{name:"Select unversioned new.ts"}));await user.click(screen.getByRole("button",{name:"More file actions"}));
  expect(screen.getByRole("button",{name:"Delete file"})).toBeEnabled();expect(native.deleteFiles).not.toHaveBeenCalled();
});
