import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type GitRemotesState } from "@/lib/native";
import { setLanguage, t } from "@/lib/i18n";
import { RemotesManager } from "./remotes-manager";

vi.mock("@/lib/native", () => ({native: {remotes: vi.fn(), remoteAction: vi.fn()}}));
const state: GitRemotesState = {reviewToken: "reviewed", remotes: [{name: "origin", fetchUrls: ["https://example.invalid/repo.git"], pushUrls: ["https://example.invalid/repo.git"], pushUrlConfigured: false, hasCredentials: false, multipleUrls: false}]};
const props = {workspaceId: "w", path: "/repo", blocked: false, onBusyChange: vi.fn(), onChanged: vi.fn()};
beforeEach(() => {vi.resetAllMocks(); setLanguage("en"); vi.mocked(native.remotes).mockResolvedValue(state); vi.mocked(native.remoteAction).mockResolvedValue("Remote configuration updated.");});
it.each(["en", "fa", "ar", "zh"] as const)("reviews removal in %s and sends the captured repository token", async language => {
  setLanguage(language); const user = userEvent.setup(); render(<RemotesManager {...props} />);
  await user.click(await screen.findByRole("button", {name: t("Remove remote")}));
  const dialog = screen.getByRole("dialog"); expect(within(dialog).getByText(t("Remove local remote configuration and tracking references. Repository files and branches on the server are preserved."))).toBeInTheDocument();
  expect(native.remoteAction).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", {name: t("Remove remote")}));
  await waitFor(() => expect(native.remoteAction).toHaveBeenCalledWith("w", "/repo", expect.objectContaining({action: "remove", target: "origin", reviewToken: "reviewed"})));
  await waitFor(() => expect(props.onBusyChange).toHaveBeenLastCalledWith(false));
});
it("adds a remote with a separate push URL after explicit review", async () => {
  const user = userEvent.setup(); render(<RemotesManager {...props} />);
  await user.click(await screen.findByRole("button", {name: "Add remote"})); const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("button", {name: "Add remote"})).toBeDisabled();
  await user.type(within(dialog).getByLabelText("Remote name"), "backup");
  await user.type(within(dialog).getByLabelText("Fetch URL"), "https://example.invalid/read.git");
  await user.type(within(dialog).getByLabelText("Push URL (optional)"), "ssh://git@example.invalid/write.git");
  expect(native.remoteAction).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", {name: "Add remote"}));
  await waitFor(() => expect(native.remoteAction).toHaveBeenCalledWith("w", "/repo", {action: "add", target: "", name: "backup", fetchUrl: "https://example.invalid/read.git", pushUrl: "ssh://git@example.invalid/write.git", reviewToken: "reviewed"}));
});
it("refreshes after stale rejection without automatically retrying", async () => {
  vi.mocked(native.remoteAction).mockRejectedValue("Repository changed. Refresh and review the operation again.");
  const user = userEvent.setup(); render(<RemotesManager {...props} />);
  await user.click(await screen.findByRole("button", {name: "Remove remote"}));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Remove remote"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Repository changed");
  await waitFor(() => expect(native.remotes).toHaveBeenCalledTimes(2)); expect(native.remoteAction).toHaveBeenCalledTimes(1);
});
it("requires clean replacement addresses when existing credentials were redacted", async () => {
  vi.mocked(native.remotes).mockResolvedValue({...state, remotes: [{...state.remotes[0], hasCredentials: true}]});
  const user = userEvent.setup(); render(<RemotesManager {...props} />);
  await user.click(await screen.findByRole("button", {name: "Edit remote"})); const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText("Fetch URL")).toHaveValue("");
  expect(within(dialog).getByRole("button", {name: "Edit remote"})).toBeDisabled();
});
it("keeps multiple destination remotes read-only for URL editing", async () => {
  vi.mocked(native.remotes).mockResolvedValue({...state, remotes: [{...state.remotes[0], multipleUrls: true, pushUrls: ["https://example.invalid/a", "https://example.invalid/b"]}]});
  render(<RemotesManager {...props} />);
  expect(await screen.findByRole("button", {name: "Edit remote"})).toBeDisabled();
  expect(screen.getByText("This remote has multiple URLs. Edit it using Git to preserve every destination.")).toBeInTheDocument();
});
it("discards the captured request when switching repositories", async () => {
  const user = userEvent.setup(); const view = render(<RemotesManager {...props} />);
  await user.click(await screen.findByRole("button", {name: "Remove remote"}));
  view.rerender(<RemotesManager {...props} path="/other" />);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(native.remoteAction).not.toHaveBeenCalled();
});
