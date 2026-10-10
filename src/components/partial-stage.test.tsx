import {render,screen,waitFor,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach,it,expect,vi} from "vitest";
import {native} from "@/lib/native";
import {setLanguage,t} from "@/lib/i18n";
import {PartialStage} from "./partial-stage";
vi.mock("@/lib/native",()=>({native:{partialStage:vi.fn(),stageHunk:vi.fn()}}));
const props={workspaceId:"w",path:"/repo",file:"file.txt",staged:false,blocked:false,onBusyChange:vi.fn(),onChanged:vi.fn()};
beforeEach(()=>{vi.resetAllMocks();setLanguage("en");vi.mocked(native.partialStage).mockResolvedValue({reviewToken:"review",hunks:["diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n","diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -30 +30 @@\n-before\n+after\n"],unavailable:null});vi.mocked(native.stageHunk).mockResolvedValue("Change block staged.");});
it.each(["en","fa","ar","zh"] as const)("stages only the reviewed selected block in %s",async lang=>{
 setLanguage(lang);const user=userEvent.setup();render(<PartialStage {...props}/>);await user.click(screen.getByRole("button",{name:t("Stage change blocks")}));
 const select=await screen.findByLabelText(t("Change block"));await user.selectOptions(select,"1");
 expect(native.stageHunk).not.toHaveBeenCalled();await user.click(screen.getByRole("button",{name:t("Stage this block")}));
 await waitFor(()=>expect(native.stageHunk).toHaveBeenCalledExactlyOnceWith("w","/repo","file.txt",false,1,"review"));await waitFor(()=>expect(props.onChanged).toHaveBeenCalled());
});
it("does not retry a stale change block or hide its error during refresh",async()=>{
 vi.mocked(native.stageHunk).mockRejectedValue("Repository changed. Refresh and review the operation again.");const user=userEvent.setup();render(<PartialStage {...props}/>);await user.click(screen.getByRole("button",{name:"Stage change blocks"}));await screen.findByLabelText("Change block");await user.click(screen.getByRole("button",{name:"Stage this block"}));await waitFor(()=>expect(native.partialStage).toHaveBeenCalledTimes(2));expect(native.stageHunk).toHaveBeenCalledTimes(1);expect(await screen.findByRole("alert")).toHaveTextContent("Repository changed");
});
it("shows whole-file guidance for a binary or unsupported file without a write action",async()=>{vi.mocked(native.partialStage).mockResolvedValue({reviewToken:"review",hunks:[],unavailable:"Partial staging requires UTF-8 text."});const user=userEvent.setup();render(<PartialStage {...props}/>);await user.click(screen.getByRole("button",{name:"Stage change blocks"}));expect(await screen.findByText("Partial staging requires UTF-8 text.")).toBeInTheDocument();expect(within(screen.getByRole("dialog")).queryByRole("button",{name:"Stage this block"})).not.toBeInTheDocument();});
it("stages only selected changed line indices and clears selection after refresh",async()=>{
 const user=userEvent.setup();render(<PartialStage {...props}/>);await user.click(screen.getByRole("button",{name:"Stage change blocks"}));await screen.findByLabelText("Change block");await user.click(screen.getByRole("checkbox",{name:"Select individual lines"}));
 const apply=screen.getByRole("button",{name:"Stage selected lines"});expect(apply).toBeDisabled();await user.click(screen.getByRole("checkbox",{name:"Select changed line 6"}));await user.click(apply);
 await waitFor(()=>expect(native.stageHunk).toHaveBeenCalledExactlyOnceWith("w","/repo","file.txt",false,0,"review",[5]));await waitFor(()=>expect(screen.getByRole("button",{name:"Stage selected lines"})).toBeDisabled());
});
it("unstages selected lines without applying a complete hunk",async()=>{
 const user=userEvent.setup();render(<PartialStage {...props} staged/>);await user.click(screen.getByRole("button",{name:"Unstage change blocks"}));await screen.findByLabelText("Change block");await user.click(screen.getByRole("checkbox",{name:"Select individual lines"}));await user.click(screen.getByRole("checkbox",{name:"Select changed line 5"}));await user.click(screen.getByRole("button",{name:"Unstage selected lines"}));await waitFor(()=>expect(native.stageHunk).toHaveBeenCalledExactlyOnceWith("w","/repo","file.txt",true,0,"review",[4]));
});
