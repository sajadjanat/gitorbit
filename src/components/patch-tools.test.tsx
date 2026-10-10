import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type GitToolsState, type PatchPreview } from "@/lib/native";
import { setLanguage } from "@/lib/i18n";
import { patchText } from "@/lib/patch-tools-messages";
import { PatchTools } from "./patch-tools";
vi.mock("@/lib/native",()=>({native:{tools:vi.fn(),exportPatch:vi.fn(),savePatch:vi.fn(),choosePatch:vi.fn(),previewPatch:vi.fn(),applyPatch:vi.fn()}}));
const preview:PatchPreview={reviewToken:"patch-review",patchPath:"/tmp/changes.patch",files:["file.txt"],stat:" file.txt | 2 +-",summary:"",canApply:true,error:null};
const props={workspaceId:"w",path:"/repo",paths:["file.txt"],blocked:false,onBusyChange:vi.fn(),onChanged:vi.fn()};
beforeEach(()=>{vi.resetAllMocks();setLanguage("en");vi.mocked(native.tools).mockResolvedValue({reviewToken:"review"}as GitToolsState);vi.mocked(native.exportPatch).mockResolvedValue({text:"patch data",reviewToken:"review",files:["file.txt"]});vi.mocked(native.savePatch).mockResolvedValue("/tmp/export.patch");vi.mocked(native.choosePatch).mockResolvedValue(preview.patchPath);vi.mocked(native.previewPatch).mockResolvedValue(preview);vi.mocked(native.applyPatch).mockResolvedValue("Patch applied to the working tree. Stage and commit the changes when ready.");});
it("exports only reviewed selection and scope after an explicit save action",async()=>{
  const user=userEvent.setup();const view=render(<PatchTools {...props}/>);await user.click(screen.getByRole("button",{name:"Export patch"}));await waitFor(()=>expect(screen.getByRole("button",{name:"Save patch file"})).toBeEnabled());
  view.rerender(<PatchTools {...props} paths={["different.txt"]}/>);expect(native.exportPatch).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"Save patch file"}));await waitFor(()=>expect(native.exportPatch).toHaveBeenCalledWith("w","/repo",["file.txt"],false,"review"));expect(native.savePatch).toHaveBeenCalledWith("patch data");expect(await screen.findByRole("status")).toHaveTextContent("Patch saved");
});
it("reviews a chosen patch and uses the returned path and token without auto committing",async()=>{
  const user=userEvent.setup();render(<PatchTools {...props}/>);await user.click(screen.getByRole("button",{name:"Apply patch"}));await user.click(screen.getByRole("button",{name:"Choose patch file"}));
  expect(await screen.findByText("Patch check passed.")).toBeInTheDocument();expect(native.applyPatch).not.toHaveBeenCalled();
  await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Apply patch"}));await waitFor(()=>expect(native.applyPatch).toHaveBeenCalledWith("w","/repo",preview.patchPath,"patch-review"));await waitFor(()=>expect(props.onBusyChange).toHaveBeenLastCalledWith(false));
});
it("disables apply when Git check fails and keeps the error available",async()=>{
  vi.mocked(native.previewPatch).mockResolvedValue({...preview,canApply:false,error:"Patch does not apply"});const user=userEvent.setup();render(<PatchTools {...props}/>);await user.click(screen.getByRole("button",{name:"Apply patch"}));await user.click(screen.getByRole("button",{name:"Choose patch file"}));expect(await screen.findByRole("alert")).toHaveTextContent("Patch does not apply");expect(within(screen.getByRole("dialog")).getByRole("button",{name:"Apply patch"})).toBeDisabled();expect(native.applyPatch).not.toHaveBeenCalled();
});
it("does not retry a changed patch and requires a refreshed review",async()=>{
  vi.mocked(native.applyPatch).mockRejectedValue("The repository or patch changed. Refresh and review the patch again.");const user=userEvent.setup();render(<PatchTools {...props}/>);await user.click(screen.getByRole("button",{name:"Apply patch"}));await user.click(screen.getByRole("button",{name:"Choose patch file"}));await screen.findByText("Patch check passed.");await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Apply patch"}));expect(await screen.findByRole("alert")).toHaveTextContent("patch changed");expect(native.applyPatch).toHaveBeenCalledTimes(1);expect(within(screen.getByRole("dialog")).getByRole("button",{name:"Apply patch"})).toBeDisabled();await user.click(screen.getByRole("button",{name:"Refresh"}));await waitFor(()=>expect(native.previewPatch).toHaveBeenCalledTimes(2));expect(native.applyPatch).toHaveBeenCalledTimes(1);
});
it.each(["en","fa","ar","zh"]as const)("supports %s patch review with isolated paths",async language=>{
  setLanguage(language);const text=(key:string)=>patchText(key,language);const user=userEvent.setup();render(<PatchTools {...props}/>);await user.click(screen.getByRole("button",{name:text("Export patch")}));expect(screen.getByRole("dialog")).toHaveAttribute("dir",language==="fa"||language==="ar"?"rtl":"ltr");expect(screen.getByText("file.txt")).toHaveAttribute("dir","ltr");
});
it("does not save anything when the file dialog is cancelled",async()=>{
  vi.mocked(native.savePatch).mockResolvedValue(null);const user=userEvent.setup();render(<PatchTools {...props}/>);await user.click(screen.getByRole("button",{name:"Export patch"}));await waitFor(()=>expect(screen.getByRole("button",{name:"Save patch file"})).toBeEnabled());await user.click(screen.getByRole("button",{name:"Save patch file"}));await waitFor(()=>expect(native.savePatch).toHaveBeenCalledTimes(1));expect(screen.queryByText(/Patch saved/)).not.toBeInTheDocument();
});
