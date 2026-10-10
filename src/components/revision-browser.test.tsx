import {act,render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach,expect,it,vi} from "vitest";
import {native,type RevisionBlob,type RevisionTree} from "@/lib/native";
import {setLanguage} from "@/lib/i18n";
import {revisionText} from "@/lib/revision-browser-messages";
import {RevisionBrowser} from "./revision-browser";
vi.mock("@/lib/native",()=>({native:{revisionTree:vi.fn(),revisionBlob:vi.fn(),fileBlame:vi.fn()}}));
const revision="a".repeat(40);const fileHash="b".repeat(40);
const props={workspaceId:"w",path:"/repo",revision,subject:"Published snapshot"};
const tree:RevisionTree={revision,directory:"",truncated:false,entries:[{name:"src",path:"src",kind:"directory",hash:fileHash,size:null},{name:"file.txt",path:"file.txt",kind:"file",hash:fileHash,size:9}]};
const file:RevisionBlob={revision,path:"file.txt",text:"snapshot text",binary:false,truncated:false,size:13,kind:"file"};
beforeEach(()=>{vi.resetAllMocks();setLanguage("en");vi.mocked(native.revisionTree).mockImplementation(async(_w,_p,_r,directory)=>directory?{...tree,directory,entries:[{name:"nested.txt",path:`${directory}/nested.txt`,kind:"file",hash:fileHash,size:3}]}:tree);vi.mocked(native.revisionBlob).mockResolvedValue(file);vi.mocked(native.fileBlame).mockResolvedValue({revision,truncated:false,lines:[{hash:fileHash,author:"Original author",timestamp:1700000000,originalLine:3,line:1,path:"old.txt",text:"annotated snapshot"}]});});
it("browses folders lazily and returns to a parent without modifying a checkout",async()=>{
  const user=userEvent.setup();render(<RevisionBrowser {...props}/>);expect(native.revisionTree).not.toHaveBeenCalled();await user.click(screen.getByRole("button",{name:"Browse revision"}));await user.click(await screen.findByRole("button",{name:"src"}));await waitFor(()=>expect(native.revisionTree).toHaveBeenLastCalledWith("w","/repo",revision,"src"));await user.click(await screen.findByRole("button",{name:"nested.txt"}));await waitFor(()=>expect(native.revisionBlob).toHaveBeenCalledWith("w","/repo",revision,"src/nested.txt"));expect(await screen.findByText("snapshot text")).toBeInTheDocument();await user.click(screen.getByRole("button",{name:"Repository root"}));await waitFor(()=>expect(native.revisionTree).toHaveBeenLastCalledWith("w","/repo",revision,""));
});
it("annotates exactly the requested snapshot rather than current HEAD",async()=>{
  const user=userEvent.setup();render(<RevisionBrowser {...props}/>);await user.click(screen.getByRole("button",{name:"Browse revision"}));await user.click(await screen.findByRole("button",{name:"file.txt"}));await screen.findByText("snapshot text");await user.click(screen.getByRole("tab",{name:"Annotate this revision"}));expect(await screen.findByText("annotated snapshot")).toBeInTheDocument();expect(native.fileBlame).toHaveBeenCalledWith("w","/repo","file.txt",revision);expect(screen.getByText("Original author")).toBeInTheDocument();
});
it.each([{binary:true,truncated:false,message:"Binary file: text preview is unavailable."},{binary:null,truncated:true,message:"File exceeds the 2 MiB text preview limit."}])("explains unavailable previews: $message",async({binary,truncated,message})=>{
  vi.mocked(native.revisionBlob).mockResolvedValue({...file,text:null,binary,truncated});const user=userEvent.setup();render(<RevisionBrowser {...props}/>);await user.click(screen.getByRole("button",{name:"Browse revision"}));await user.click(await screen.findByRole("button",{name:"file.txt"}));expect(await screen.findByText(message)).toBeInTheDocument();expect(screen.getByRole("tab",{name:"Annotate this revision"})).toBeDisabled();
});
it("displays submodule hashes without opening their external repository",async()=>{
  vi.mocked(native.revisionTree).mockResolvedValue({...tree,entries:[{name:"module",path:"module",kind:"submodule",hash:fileHash,size:null}]});const user=userEvent.setup();render(<RevisionBrowser {...props}/>);await user.click(screen.getByRole("button",{name:"Browse revision"}));await user.click(await screen.findByRole("button",{name:"module"}));expect(screen.getByText("Submodule commit")).toBeInTheDocument();expect(screen.getByText(fileHash)).toBeInTheDocument();expect(native.revisionBlob).not.toHaveBeenCalled();
});
it("labels symlink values as targets and disables annotations",async()=>{
  vi.mocked(native.revisionTree).mockResolvedValue({...tree,entries:[{name:"link",path:"link",kind:"symlink",hash:fileHash,size:9}]});vi.mocked(native.revisionBlob).mockResolvedValue({...file,kind:"symlink",path:"link",text:"/outside/private"});const user=userEvent.setup();render(<RevisionBrowser {...props}/>);await user.click(screen.getByRole("button",{name:"Browse revision"}));await user.click(await screen.findByRole("button",{name:"link"}));expect(await screen.findByText("Symbolic link target (not followed)")).toBeInTheDocument();expect(screen.getByRole("tab",{name:"Annotate this revision"})).toBeDisabled();
});
it("ignores an old blob response after a different snapshot is selected",async()=>{
  let resolve!:(value:RevisionBlob)=>void;vi.mocked(native.revisionBlob).mockImplementationOnce(()=>new Promise(value=>{resolve=value;}));const user=userEvent.setup();const view=render(<RevisionBrowser {...props}/>);await user.click(screen.getByRole("button",{name:"Browse revision"}));await user.click(await screen.findByRole("button",{name:"file.txt"}));view.rerender(<RevisionBrowser {...props} revision={"c".repeat(40)}/>);await waitFor(()=>expect(native.revisionTree).toHaveBeenLastCalledWith("w","/repo","c".repeat(40),""));await act(async()=>resolve({...file,text:"obsolete contents"}));expect(screen.queryByText("obsolete contents")).not.toBeInTheDocument();
});
it.each(["en","fa","ar","zh"]as const)("supports %s direction while rendering committed text LTR",async language=>{
  setLanguage(language);const text=(key:string)=>revisionText(key,language);const user=userEvent.setup();render(<RevisionBrowser {...props}/>);await user.click(screen.getByRole("button",{name:text("Browse revision")}));expect(screen.getByRole("dialog")).toHaveAttribute("dir",language==="fa"||language==="ar"?"rtl":"ltr");await user.click(await screen.findByRole("button",{name:"file.txt"}));expect(await screen.findByText("snapshot text")).toHaveAttribute("dir","ltr");
});
it("allows refresh after a failed directory read",async()=>{
  vi.mocked(native.revisionTree).mockRejectedValueOnce("Revision unavailable");const user=userEvent.setup();render(<RevisionBrowser {...props}/>);await user.click(screen.getByRole("button",{name:"Browse revision"}));expect(await screen.findByRole("alert")).toHaveTextContent("Revision unavailable");await user.click(screen.getByRole("button",{name:"Refresh"}));expect(await screen.findByRole("button",{name:"file.txt"})).toBeInTheDocument();
});
