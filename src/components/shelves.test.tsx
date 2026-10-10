import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach,expect,it,vi} from "vitest";
import {native,type Shelves as ShelfState,type StashPreview} from "@/lib/native";
import {setLanguage,t} from "@/lib/i18n";
import {ShelveFiles,Shelves} from "./shelves";
vi.mock("@/lib/native",()=>({native:{shelves:vi.fn(),shelfAction:vi.fn(),shelfPreview:vi.fn(),shelfDiff:vi.fn()}}));
const entry={id:"refs/gitorbit/shelves/1",hash:"a".repeat(40),title:"Saved task",timestamp:1780000000};
const state:ShelfState={reviewToken:"reviewed",entries:[entry]};
const snapshot:StashPreview={reviewToken:"reviewed",hash:entry.hash,subject:entry.title,baseRevision:"b".repeat(40),indexRevision:"c".repeat(40),untrackedRevision:null,files:[{path:"src/file.ts",originalPath:null,status:"M",area:"working"}]};
const props={workspaceId:"w",path:"/repo",blocked:false,onBusyChange:vi.fn(),onChanged:vi.fn()};
beforeEach(()=>{vi.resetAllMocks();setLanguage("en");vi.mocked(native.shelves).mockResolvedValue(state);vi.mocked(native.shelfPreview).mockResolvedValue(snapshot);vi.mocked(native.shelfDiff).mockResolvedValue({text:"--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1 +1 @@\n-old\n+saved\n",truncated:false,beforeRevision:snapshot.baseRevision,afterRevision:entry.hash});vi.mocked(native.shelfAction).mockResolvedValue("Shelf restored with its staging state. The shelf remains available.");});
it.each(["en","fa","ar","zh"] as const)("reviews selected files before shelving in %s",async language=>{
  setLanguage(language);const user=userEvent.setup();render(<ShelveFiles {...props} paths={["src/file.ts","new.txt","src/file.ts"]}/>);
  await user.click(screen.getByRole("button",{name:t("Shelve selected…")}));const dialog=screen.getByRole("dialog");
  await waitFor(()=>expect(native.shelves).toHaveBeenCalled());expect(within(dialog).getAllByText("src/file.ts")).toHaveLength(1);
  fireEvent.change(within(dialog).getByRole("textbox"),{target:{value:"Task draft"}});expect(native.shelfAction).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button",{name:t("Shelve files")}));await waitFor(()=>expect(native.shelfAction).toHaveBeenCalledWith("w","/repo",{action:"save",id:"",reviewToken:"reviewed",paths:["new.txt","src/file.ts"],message:"Task draft"}));
});
it("requires confirmation for restore and keeps mutation errors visible after refreshing",async()=>{
  vi.mocked(native.shelfAction).mockRejectedValue("The shelf overlaps local changes. Commit or shelve those files first.");
  const user=userEvent.setup();render(<Shelves {...props}/>);await user.click(screen.getByRole("button",{name:"Shelf"}));
  await user.click(await screen.findByRole("button",{name:"Unshelve…"}));expect(native.shelfAction).not.toHaveBeenCalled();
  expect(screen.getByText("Restore this shelf?")).toBeInTheDocument();await user.click(screen.getByRole("button",{name:"Unshelve"}));
  await waitFor(()=>expect(native.shelves).toHaveBeenCalledTimes(2));expect(screen.getByRole("alert")).toHaveTextContent("overlaps");expect(native.shelfAction).toHaveBeenCalledTimes(1);
});
it("deletes the reviewed shelf only after explicit confirmation",async()=>{
  const user=userEvent.setup();render(<Shelves {...props}/>);await user.click(screen.getByRole("button",{name:"Shelf"}));
  await user.click(await screen.findByRole("button",{name:"Delete shelf…"}));expect(native.shelfAction).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"Delete shelf"}));await waitFor(()=>expect(native.shelfAction).toHaveBeenCalledWith("w","/repo",{action:"delete",id:entry.id,reviewToken:"reviewed",paths:[],message:""}));
});
it("previews saved file diffs without writing and exposes shelf context actions",async()=>{
  const user=userEvent.setup();render(<Shelves {...props}/>);await user.click(screen.getByRole("button",{name:"Shelf"}));
  await waitFor(()=>expect(screen.getByLabelText("Side-by-side diff")).toHaveTextContent("saved"));expect(native.shelfAction).not.toHaveBeenCalled();
  fireEvent.contextMenu(screen.getByRole("button",{name:/^Saved task/}));expect(await screen.findByRole("menuitem",{name:"Unshelve…"})).toBeInTheDocument();
});
it("keeps a failed save draft and requires a fresh review",async()=>{
  vi.mocked(native.shelfAction).mockRejectedValue("Repository changed. Refresh and review the operation again.");const user=userEvent.setup();render(<ShelveFiles {...props} paths={["src/file.ts"]}/>);
  await user.click(screen.getByRole("button",{name:"Shelve selected…"}));await waitFor(()=>expect(native.shelves).toHaveBeenCalled());await user.type(screen.getByRole("textbox"),"Keep this draft");await user.click(screen.getByRole("button",{name:"Shelve files"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Repository changed");expect(screen.getByRole("textbox")).toHaveValue("Keep this draft");expect(screen.getByRole("button",{name:"Shelve files"})).toBeDisabled();expect(native.shelfAction).toHaveBeenCalledTimes(1);
});

it("navigates shelf file groups with the keyboard",async()=>{const user=userEvent.setup();render(<Shelves {...props}/>);await user.click(screen.getByRole("button",{name:"Shelf"}));const tab=await screen.findByRole("tab",{name:/^Working tree/});tab.focus();await user.keyboard("{ArrowRight}");expect(screen.getByRole("tab",{name:/^Staged/})).toHaveFocus();expect(screen.getByRole("tab",{name:/^Staged/})).toHaveAttribute("aria-selected","true");expect(native.shelfAction).not.toHaveBeenCalled();});
