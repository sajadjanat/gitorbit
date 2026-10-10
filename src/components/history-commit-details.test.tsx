import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type CommitFile, type CommitDiff } from "@/lib/native";
import { setLanguage, t } from "@/lib/i18n";
import { HistoryCommitDetails } from "./history-commit-details";
vi.mock("@/lib/native",()=>({native:{historyCommitFiles:vi.fn(),historyCommitDiff:vi.fn()}}));
const hash="a".repeat(40);
const props={workspaceId:"w",path:"/repo",hash,subject:"Already published commit"};
const files:CommitFile[]=[{path:"[literal].txt",originalPath:null,status:"M"},{path:"new.txt",originalPath:"old.txt",status:"R100"}];
const diff:CommitDiff={text:"@@ -1 +1 @@\n-before\n+after",truncated:false,beforeRevision:"b".repeat(40),afterRevision:hash};
beforeEach(()=>{vi.resetAllMocks();setLanguage("en");vi.mocked(native.historyCommitFiles).mockResolvedValue(files);vi.mocked(native.historyCommitDiff).mockResolvedValue(diff);});
it("loads arbitrary published commit files on demand and previews committed literal paths",async()=>{
  const user=userEvent.setup();render(<HistoryCommitDetails {...props}/>);expect(native.historyCommitFiles).not.toHaveBeenCalled();await user.click(screen.getByRole("button",{name:"Changed files"}));
  await user.click(await screen.findByRole("button",{name:/\[literal\]\.txt/}));
  expect(native.historyCommitFiles).toHaveBeenCalledWith("w","/repo",hash);await waitFor(()=>expect(native.historyCommitDiff).toHaveBeenCalledWith("w","/repo",hash,"[literal].txt"));
  expect(await screen.findByLabelText("aaaaaaa code")).toBeInTheDocument();
  await user.click(screen.getByRole("button",{name:"Close diff"}));expect(screen.getByText("Select a file to review its diff.")).toBeInTheDocument();expect(screen.getByRole("button",{name:/new\.txt/})).toBeInTheDocument();
});
it("reports history and diff failures without preventing dialog close",async()=>{
  vi.mocked(native.historyCommitFiles).mockRejectedValueOnce("Commit unavailable");const user=userEvent.setup();render(<HistoryCommitDetails {...props}/>);await user.click(screen.getByRole("button",{name:"Changed files"}));expect(await screen.findByRole("alert")).toHaveTextContent("Commit unavailable");await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Close"}));expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button",{name:"Changed files"}));vi.mocked(native.historyCommitDiff).mockRejectedValueOnce("File unavailable");await user.click(await screen.findByRole("button",{name:/\[literal\]\.txt/}));expect(await screen.findByRole("alert")).toHaveTextContent("File unavailable");
  await user.click(screen.getByRole("button",{name:/new\.txt/}));await screen.findByLabelText("aaaaaaa code");expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("ignores obsolete commit-file responses after the inspected hash changes",async()=>{
  let first!:(value:CommitFile[])=>void;vi.mocked(native.historyCommitFiles).mockImplementationOnce(()=>new Promise(resolve=>{first=resolve;}));const user=userEvent.setup();const view=render(<HistoryCommitDetails {...props}/>);await user.click(screen.getByRole("button",{name:"Changed files"}));
  view.rerender(<HistoryCommitDetails {...props} hash={"c".repeat(40)} subject="Another commit"/>);await screen.findByRole("button",{name:/\[literal\]\.txt/});await act(async()=>first([{path:"obsolete.txt",originalPath:null,status:"A"}]));expect(screen.queryByText("obsolete.txt")).not.toBeInTheDocument();
});
it("ignores an obsolete diff response after another file is selected",async()=>{
  let first!:(value:CommitDiff)=>void;vi.mocked(native.historyCommitDiff).mockImplementationOnce(()=>new Promise(resolve=>{first=resolve;}));const user=userEvent.setup();render(<HistoryCommitDetails {...props}/>);await user.click(screen.getByRole("button",{name:"Changed files"}));await user.click(await screen.findByRole("button",{name:/\[literal\]\.txt/}));await user.click(screen.getByRole("button",{name:/new\.txt/}));await screen.findByLabelText("aaaaaaa code");
  await act(async()=>first({...diff,text:"@@ -1 +1 @@\n-stale-before\n+stale-after"}));expect(screen.queryByText("stale-after")).not.toBeInTheDocument();
});
it.each(["en","fa","ar","zh"]as const)("keeps commit-file review localized and source LTR in %s",async language=>{
  setLanguage(language);const user=userEvent.setup();render(<HistoryCommitDetails {...props}/>);await user.click(screen.getByRole("button",{name:t("Changed files")}));expect(screen.getByRole("dialog")).toHaveAttribute("dir",language==="fa"||language==="ar"?"rtl":"ltr");await user.click(await screen.findByRole("button",{name:/\[literal\]\.txt/}));expect(await screen.findByLabelText(t("{label} code",{label:"aaaaaaa"}))).toHaveAttribute("dir","ltr");
});
it("explains an empty commit without requesting a file diff",async()=>{
  vi.mocked(native.historyCommitFiles).mockResolvedValue([]);const user=userEvent.setup();render(<HistoryCommitDetails {...props}/>);await user.click(screen.getByRole("button",{name:"Changed files"}));expect(await screen.findByText("No files changed in this commit.")).toBeInTheDocument();expect(native.historyCommitDiff).not.toHaveBeenCalled();
});
