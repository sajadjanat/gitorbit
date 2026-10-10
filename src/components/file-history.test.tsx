import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type FileHistoryCommit } from "@/lib/native";
import { setLanguage } from "@/lib/i18n";
import { fileHistoryText } from "@/lib/file-history-messages";
import { FileHistory } from "./file-history";

vi.mock("@/lib/native", () => ({ native: {fileHistory: vi.fn(), fileHistoryDiff: vi.fn(), fileBlame: vi.fn()} }));
const latest: FileHistoryCommit = {hash: "a".repeat(40), author: "Demo Author", timestamp: 1700000000, subject: "Rename source", path: "new.txt", previousPath: "old.txt", status: "R100"};
const oldest: FileHistoryCommit = {...latest, hash: "b".repeat(40), path: "old.txt", previousPath: null, status: "A", subject: "Create source"};
const props = {workspaceId: "workspace", path: "/repo", file: "new.txt"};
beforeEach(() => {
  vi.resetAllMocks(); setLanguage("en");
  vi.mocked(native.fileHistory).mockResolvedValue({commits: [latest, oldest], hasMore: false, shallow: false});
  vi.mocked(native.fileHistoryDiff).mockResolvedValue({text: "@@ -1 +1 @@\n-old\n+new", truncated: false, beforeRevision: oldest.hash, afterRevision: latest.hash});
  vi.mocked(native.fileBlame).mockResolvedValue({revision: latest.hash, truncated: false, lines: [{hash: oldest.hash, author: "Original author", timestamp: 1700000000, originalLine: 7, line: 2, path: "old.txt", text: "source code"}]});
});
it("loads only on demand, follows historical paths and annotates the chosen committed revision", async () => {
  const user = userEvent.setup(); render(<FileHistory {...props} />);
  expect(native.fileHistory).not.toHaveBeenCalled(); await user.click(screen.getByRole("button", {name: "History"}));
  await waitFor(() => expect(native.fileHistoryDiff).toHaveBeenCalledWith("workspace", "/repo", "new.txt", latest.hash));
  await user.click(screen.getByRole("button", {name: /Create source/}));
  await waitFor(() => expect(native.fileHistoryDiff).toHaveBeenLastCalledWith("workspace", "/repo", "old.txt", oldest.hash));
  await user.click(screen.getByRole("tab", {name: "Annotate"}));
  expect(await screen.findByText("source code")).toBeInTheDocument();
  expect(native.fileBlame).toHaveBeenCalledWith("workspace", "/repo", "old.txt", oldest.hash);
  expect(screen.getByText("Original author")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", {name: "Original line"})).toBeInTheDocument();
});
it.each(["en", "fa", "ar", "zh"] as const)("supports localized dialogs and fixed LTR source in %s", async language => {
  setLanguage(language); const text = (key: string) => fileHistoryText(key, language);
  const user = userEvent.setup(); render(<FileHistory {...props} />);
  await user.click(screen.getByRole("button", {name: text("History")}));
  expect(screen.getByRole("dialog")).toHaveAttribute("dir", language === "fa" || language === "ar" ? "rtl" : "ltr");
  await screen.findByRole("button", {name: /Rename source/});
  await user.click(screen.getByRole("tab", {name: text("Annotate")}));
  await screen.findByText("source code");
  expect(screen.getByRole("region", {name: text("Annotate")})).toHaveAttribute("dir", "ltr");
});
it("does not display late history results after the file changes", async () => {
  let resolveFirst!: (value: {commits: FileHistoryCommit[];hasMore:boolean;shallow:boolean}) => void;
  vi.mocked(native.fileHistory).mockImplementationOnce(() => new Promise(resolve => {resolveFirst = resolve;}));
  const user = userEvent.setup(); const view = render(<FileHistory {...props} />);
  await user.click(screen.getByRole("button", {name: "History"}));
  view.rerender(<FileHistory {...props} file="other.txt" />);
  await screen.findByRole("button", {name: /Rename source/});
  await act(async () => resolveFirst({commits: [{...oldest, subject: "Stale response"}], hasMore: false, shallow: false}));
  expect(screen.queryByText("Stale response")).not.toBeInTheDocument();
});
it("explains deleted revisions without trying to blame a missing blob", async () => {
  vi.mocked(native.fileHistory).mockResolvedValue({commits: [{...latest, status: "D", subject: "Delete source"}], hasMore: false, shallow: false});
  const user = userEvent.setup(); render(<FileHistory {...props} />); await user.click(screen.getByRole("button", {name: "History"}));
  await screen.findByRole("button", {name: /Delete source/}); await user.click(screen.getByRole("tab", {name: "Annotate"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose an earlier commit"); expect(native.fileBlame).not.toHaveBeenCalled();
});
it("supports refresh after an error and reports shallow or partial histories", async () => {
  vi.mocked(native.fileHistory).mockRejectedValueOnce("Read failed").mockResolvedValue({commits: [latest], hasMore: true, shallow: true});
  const user = userEvent.setup(); render(<FileHistory {...props} />); await user.click(screen.getByRole("button", {name: "History"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Read failed");
  await user.click(screen.getByRole("button", {name: "Refresh history"}));
  expect(await screen.findByText(/Shallow clone/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", {name: "Load more commits"}));
  await waitFor(() => expect(native.fileHistory).toHaveBeenLastCalledWith("workspace", "/repo", "new.txt", 400));
});
it("disables the entry during blocked repository operations", () => {
  render(<FileHistory {...props} blocked />); expect(screen.getByRole("button", {name: "History"})).toBeDisabled();
});
it("retains an accessible close button", async () => {
  const user = userEvent.setup(); render(<FileHistory {...props} />); await user.click(screen.getByRole("button", {name: "History"}));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Close"}));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
