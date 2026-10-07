import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type GitToolsState } from "@/lib/native";
import { setLanguage, t } from "@/lib/i18n";
import { GitTools } from "./git-tools";
import { FileGitAction } from "./rollback-files";
import { ConflictEditor } from "./conflict-editor";

vi.mock("@/lib/native", () => ({native: {tools: vi.fn(), toolAction: vi.fn(), compare: vi.fn(), conflict: vi.fn()}}));
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
  expect(screen.getByRole("button", {name: "Delete branch"})).toBeDisabled();
  await user.click(screen.getByRole("button", {name: "feature"}));
  await user.click(screen.getByRole("button", {name: "Delete branch"}));
  expect(native.toolAction).not.toHaveBeenCalled();
  await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Cancel"}));
  expect(native.toolAction).not.toHaveBeenCalled();
});
it("creates a tracking branch from the selected remote", async () => {
  const user = userEvent.setup(); render(<GitTools {...props} />);
  await user.click(await screen.findByRole("button", {name: "origin/remote-feature"}));
  await user.click(screen.getByRole("button", {name: "Checkout"}));
  const dialog = screen.getByRole("dialog"); expect(within(dialog).getByLabelText("Branch name")).toHaveValue("remote-feature");
  await user.click(within(dialog).getByRole("button", {name: "Checkout"}));
  await waitFor(() => expect(native.toolAction).toHaveBeenCalledWith("w", "/repo", expect.objectContaining({action: "checkout", target: "refs/remotes/origin/remote-feature", name: "remote-feature"})));
});
it("refreshes after a stale-review rejection without retrying the operation automatically", async () => {
  vi.mocked(native.toolAction).mockRejectedValue("Repository changed. Refresh and review the operation again.");
  const user = userEvent.setup(); render(<GitTools {...props} />);
  await user.click(await screen.findByRole("button", {name: "feature"})); await user.click(screen.getByRole("button", {name: "Delete branch"}));
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
