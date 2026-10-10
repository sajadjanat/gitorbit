import {fireEvent,render,screen,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect,it,vi} from "vitest";
import type {Repository} from "@/lib/native";
import {number,setLanguage,t} from "@/lib/i18n";
import {RepositoryOverviewRow} from "./repository-overview-row";
import {Table,TableBody} from "./ui/table";
import {TooltipProvider} from "./ui/tooltip";
const repo:Repository={path:"/repo",name:"api",branch:"main",upstream:"origin/main",changed:1,staged:1,unstaged:1,untracked:0,conflicts:0,ahead:2,behind:3,detached:false,files:[{path:"file.ts",status:"MM",originalPath:null}],error:null,fetchError:null};
function mount(patch:Partial<Repository>={},stale=false){const open=vi.fn(),run=vi.fn();render(<TooltipProvider><Table><TableBody><RepositoryOverviewRow repo={{...repo,...patch}} stale={stale} onOpen={open} actions={[{label:"Review",run}]}/></TableBody></Table></TooltipProvider>);return {open,run};}
it.each(["en","fa","ar","zh"] as const)("labels unique files and incoming/outgoing commit counts in %s",language=>{setLanguage(language);mount();const row=screen.getByTestId("repository-overview-row");expect(within(row).getByLabelText(t("{count} changed files",{count:1}))).toHaveTextContent(number(1));expect(within(row).getByLabelText(t("{count} commits to push",{count:2}))).toHaveTextContent(number(2));expect(within(row).getByLabelText(t("{count} commits to pull",{count:3}))).toHaveTextContent(number(3));});
it("shows actual zero values and distinguishes a missing upstream",()=>{mount({changed:0,staged:0,unstaged:0,ahead:null,behind:null,upstream:null});expect(screen.getByText("No upstream")).toBeInTheDocument();expect(screen.getByLabelText("0 changed files")).toHaveTextContent("0");expect(screen.queryByLabelText("0 commits to push")).not.toBeInTheDocument();});
it.each([false,true])("does not present failed or stale data as current counts (stale=%s)",stale=>{mount(stale?{}:{error:"Access denied"},stale);expect(screen.getByText("Check status")).toBeInTheDocument();expect(screen.queryByLabelText("1 changed files")).not.toBeInTheDocument();expect(screen.queryByLabelText("2 commits to push")).not.toBeInTheDocument();});
it("opens context actions with Shift+F10 and does not open the repository when an action runs",async()=>{const user=userEvent.setup();const{open,run}=mount();const button=screen.getByRole("button",{name:"api"});button.focus();fireEvent.keyDown(button,{key:"F10",shiftKey:true});await user.click(await screen.findByRole("menuitem",{name:"Review"}));expect(run).toHaveBeenCalledTimes(1);expect(open).not.toHaveBeenCalled();});

it("returns keyboard focus after dismissing a context menu",async()=>{const user=userEvent.setup();mount();const button=screen.getByRole("button",{name:"api"});button.focus();fireEvent.keyDown(button,{key:"F10",shiftKey:true});await screen.findByRole("menuitem",{name:"Review"});await user.keyboard("{Escape}");expect(button).toHaveFocus();});
