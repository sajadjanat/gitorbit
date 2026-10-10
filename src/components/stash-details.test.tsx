import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type StashPreview, type GitToolsState } from "@/lib/native";
import { setLanguage } from "@/lib/i18n";
import { stashText } from "@/lib/stash-tools-messages";
import { SelectedStash, StashDetails } from "./stash-details";

vi.mock("@/lib/native",()=>({native:{stashPreview:vi.fn(),stashDiff:vi.fn(),stashBranch:vi.fn(),stashSelected:vi.fn(),tools:vi.fn()}}));
const hash="a".repeat(40);
const preview:StashPreview={reviewToken:"review",hash,subject:"Saved work",baseRevision:"b".repeat(40),indexRevision:"c".repeat(40),untrackedRevision:"d".repeat(40),files:[{path:"work.txt",originalPath:null,status:"M",area:"working"},{path:"staged.txt",originalPath:null,status:"M",area:"index"},{path:"new.txt",originalPath:null,status:"A",area:"untracked"}]};
const props={workspaceId:"w",path:"/repo",blocked:false,onBusyChange:vi.fn(),onChanged:vi.fn()};
beforeEach(()=>{
  vi.resetAllMocks();setLanguage("en");
  vi.mocked(native.stashPreview).mockResolvedValue(preview);
  vi.mocked(native.stashDiff).mockResolvedValue({text:"@@ -1 +1 @@\n-before\n+after",truncated:false,beforeRevision:preview.baseRevision,afterRevision:hash});
  vi.mocked(native.stashBranch).mockResolvedValue("Stash restored on a new branch. The original stash is preserved.");
  vi.mocked(native.stashSelected).mockResolvedValue("Selected files saved in a stash.");
  vi.mocked(native.tools).mockResolvedValue({reviewToken:"review"} as GitToolsState);
});
it("shows the three saved layers and loads the selected file from its correct layer",async()=>{
  const user=userEvent.setup();render(<StashDetails {...props} stashHash={hash}/>);
  expect(native.stashPreview).not.toHaveBeenCalled();await user.click(screen.getByRole("button",{name:"View stash"}));
  await waitFor(()=>expect(native.stashDiff).toHaveBeenLastCalledWith("w","/repo",hash,"work.txt","working"));
  await user.click(screen.getByRole("tab",{name:"Saved index (staged changes)"}));
  await waitFor(()=>expect(native.stashDiff).toHaveBeenLastCalledWith("w","/repo",hash,"staged.txt","index"));
  await user.click(screen.getByRole("tab",{name:"Saved unversioned files"}));
  await waitFor(()=>expect(native.stashDiff).toHaveBeenLastCalledWith("w","/repo",hash,"new.txt","untracked"));
});
it("reviews stash branch restoration and sends the immutable stash hash and preview token",async()=>{
  const user=userEvent.setup();render(<StashDetails {...props} stashHash={hash}/>);await user.click(screen.getByRole("button",{name:"View stash"}));
  await screen.findByRole("button",{name:"Create branch from stash"});await user.click(screen.getByRole("button",{name:"Create branch from stash"}));
  expect(screen.getByText(/The original stash is kept/)).toBeInTheDocument();expect(native.stashBranch).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Branch name"),"restored-work");await user.click(screen.getByRole("button",{name:"Create branch from stash"}));
  await waitFor(()=>expect(native.stashBranch).toHaveBeenCalledWith("w","/repo",hash,"restored-work","review"));
  expect(await screen.findByRole("status")).toHaveTextContent("original stash is preserved");
  await waitFor(()=>expect(props.onBusyChange).toHaveBeenLastCalledWith(false));
});
it("selected-file stash preserves the selection captured for explicit review",async()=>{
  const user=userEvent.setup();const view=render(<SelectedStash {...props} paths={["first.txt"]}/>);await user.click(screen.getByRole("button",{name:"Stash selected files"}));
  await waitFor(()=>expect(within(screen.getByRole("dialog")).getByRole("button",{name:"Stash selected files"})).toBeEnabled());
  view.rerender(<SelectedStash {...props} paths={["later.txt"]}/>);
  expect(screen.getByRole("region",{name:"Review selected paths"})).toHaveTextContent("first.txt");
  await user.type(screen.getByLabelText("Stash message"),"Selected work");await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Stash selected files"}));
  await waitFor(()=>expect(native.stashSelected).toHaveBeenCalledWith("w","/repo",["first.txt"],"Selected work","review"));
});
it("does not retry stale stash mutations automatically",async()=>{
  vi.mocked(native.stashSelected).mockRejectedValue("Repository changed. Refresh and review the operation again.");
  const user=userEvent.setup();render(<SelectedStash {...props} paths={["first.txt"]}/>);await user.click(screen.getByRole("button",{name:"Stash selected files"}));
  const dialog=screen.getByRole("dialog");await waitFor(()=>expect(within(dialog).getByRole("button",{name:"Stash selected files"})).toBeEnabled());
  await user.click(within(dialog).getByRole("button",{name:"Stash selected files"}));expect(await screen.findByRole("alert")).toHaveTextContent("Repository changed");expect(native.stashSelected).toHaveBeenCalledTimes(1);
  await user.click(within(dialog).getByRole("button",{name:"Refresh"}));await waitFor(()=>expect(native.tools).toHaveBeenCalledTimes(2));expect(native.stashSelected).toHaveBeenCalledTimes(1);
});
it.each(["en","fa","ar","zh"] as const)("uses localized stash review and correct dialog direction in %s",async language=>{
  setLanguage(language);const text=(key:string)=>stashText(key,language);const user=userEvent.setup();render(<SelectedStash {...props} paths={["file.txt"]}/>);
  await user.click(screen.getByRole("button",{name:text("Stash selected files")}));expect(screen.getByRole("dialog")).toHaveAttribute("dir",language==="fa"||language==="ar"?"rtl":"ltr");
  expect(screen.getByRole("region",{name:text("Review selected paths")})).toHaveTextContent("file.txt");
});
it("ignores stale stash-preview responses after switching the selected stash",async()=>{
  let first!:(value:StashPreview)=>void;vi.mocked(native.stashPreview).mockImplementationOnce(()=>new Promise(resolve=>{first=resolve;}));
  const user=userEvent.setup();const view=render(<StashDetails {...props} stashHash={hash}/>);await user.click(screen.getByRole("button",{name:"View stash"}));
  view.rerender(<StashDetails {...props} stashHash={"e".repeat(40)}/>);await screen.findByText("Saved work");
  await act(async()=>first({...preview,subject:"Stale preview"}));expect(screen.queryByText("Stale preview")).not.toBeInTheDocument();
});
