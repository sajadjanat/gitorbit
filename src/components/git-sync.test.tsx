import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type SyncState } from "@/lib/native";
import { setLanguage, t } from "@/lib/i18n";
import { GitSync } from "./git-sync";
vi.mock("@/lib/native", () => ({ native: {sync:vi.fn(), openRepository:vi.fn(), authentication:vi.fn(), signInFetch:vi.fn(), signIn:vi.fn(), cancelSignIn:vi.fn(), signInSetup:vi.fn()} }));
const state: SyncState = {reviewToken:"context",head:"a".repeat(40),upstreamHead:"b".repeat(40),sourceBranch:"main",remote:"origin",destinationBranch:"main",ahead:1,behind:2,dirty:0,conflicts:0,operation:null,mergeHead:null,blockedReason:null,note:null,incoming:[{hash:"b".repeat(40),subject:"Incoming change",author:"Demo",timestamp:1780000000}]};
const props = {workspaceId:"demo",path:"/demo",error:"remote contains work",blocked:false,onChanged:vi.fn(),onReady:vi.fn(),onReviewChanges:vi.fn(),onBusyChange:vi.fn()};
beforeEach(() => {vi.resetAllMocks();setLanguage("en");vi.mocked(native.sync).mockResolvedValue(state);vi.mocked(native.openRepository).mockResolvedValue();});
it.each(["en","fa","ar","zh"] as const)("fetches, explicitly merges and requires fresh push review in %s", async language => {
  setLanguage(language); const user=userEvent.setup();
  vi.mocked(native.sync).mockResolvedValueOnce(state).mockResolvedValueOnce(state).mockResolvedValueOnce({...state,head:"c".repeat(40),behind:0,incoming:[],ahead:2});
  render(<GitSync {...props}/>);
  const merge=await screen.findByRole("button",{name:t("Merge incoming commits")}); expect(merge).toBeDisabled();
  await user.click(screen.getByText(t("Incoming commits ({count})",{count:2})));expect(screen.getByText("Incoming change")).toBeVisible();
  await user.click(screen.getByRole("button",{name:t("Fetch and check")}));
  await waitFor(()=>expect(merge).toBeEnabled());await user.click(merge);
  expect(native.sync).toHaveBeenLastCalledWith("demo","/demo","integrate",state.head,state.upstreamHead,state.reviewToken);
  expect(props.onReady).not.toHaveBeenCalled();
  await user.click(await screen.findByRole("button",{name:t("Review push preview")}));expect(props.onReady).toHaveBeenCalledOnce();
  expect(props.onBusyChange.mock.calls).toEqual([[true],[false],[true],[false]]);
});
it.each(["dirty","blocked","rebase"])("keeps sync disabled and offers a remedy for %s",async kind=>{
  const blocked={...state,dirty:kind==="dirty"?2:0,blockedReason:kind==="blocked"?"Push and fetch destinations differ. Sync the push destination using Git, then retry.":null,operation:kind==="rebase"?"rebase":null};
  vi.mocked(native.sync).mockResolvedValue(blocked);const user=userEvent.setup();render(<GitSync {...props}/>);
  await screen.findByText(t("{ahead} local · {behind} incoming",{ahead:1,behind:2}));await user.click(screen.getByRole("button",{name:"Fetch and check"}));
  if(kind!=="rebase")expect(screen.getByRole("button",{name:"Merge incoming commits"})).toBeDisabled();
  else expect(screen.queryByRole("button",{name:"Merge incoming commits"})).not.toBeInTheDocument();
  if(kind!=="blocked"){await user.click(screen.getByRole("button",{name:"Review in Version Control"}));expect(props.onReviewChanges).toHaveBeenCalledOnce();}
  else {await user.click(screen.getByRole("button",{name:"Open folder"}));expect(native.openRepository).toHaveBeenCalledWith("demo","/demo");}
  expect(vi.mocked(native.sync).mock.calls.every(call=>call[2]!=="integrate")).toBe(true);
});
it("uses fast-forward action for a branch with no local commits",async()=>{
  vi.mocked(native.sync).mockResolvedValue({...state,ahead:0});const user=userEvent.setup();render(<GitSync {...props}/>);
  const pull=await screen.findByRole("button",{name:"Pull incoming commits"});expect(pull).toBeDisabled();
  await user.click(screen.getByRole("button",{name:"Fetch and check"}));await waitFor(()=>expect(pull).toBeEnabled());await user.click(pull);
  expect(native.sync).toHaveBeenLastCalledWith("demo","/demo","integrate",state.head,state.upstreamHead,state.reviewToken);
});
it("shows conflicts, requires confirmation to abort and keeps push blocked afterward",async()=>{
  vi.mocked(native.sync).mockResolvedValueOnce({...state,conflicts:1,operation:"merge",mergeHead:state.upstreamHead}).mockResolvedValueOnce(state);
  const user=userEvent.setup();render(<GitSync {...props}/>);await user.click(await screen.findByRole("button",{name:"Abort merge"}));
  let dialog=screen.getByRole("dialog");expect(within(dialog).getByText(/discards edits/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button",{name:"Cancel"}));expect(native.sync).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button",{name:"Abort merge"}));dialog=screen.getByRole("dialog");await user.click(within(dialog).getByRole("button",{name:"Abort merge"}));
  expect(native.sync).toHaveBeenLastCalledWith("demo","/demo","abort",state.head,state.upstreamHead,state.reviewToken);
  expect(await screen.findByRole("button",{name:"Merge incoming commits"})).toBeDisabled();expect(props.onReady).not.toHaveBeenCalled();
});
it("routes fetch authentication to fetch-only sign-in, then retries explicitly",async()=>{
  vi.mocked(native.sync).mockResolvedValueOnce(state).mockRejectedValueOnce("Authentication failed").mockResolvedValueOnce(state);
  vi.mocked(native.authentication).mockResolvedValue({target:"https://git.example.invalid/repo",host:"https://git.example.invalid",canSignIn:true,reason:null});
  vi.mocked(native.signInFetch).mockResolvedValue();const user=userEvent.setup();render(<GitSync {...props}/>);
  await screen.findByRole("button",{name:"Merge incoming commits"});await user.click(screen.getByRole("button",{name:"Fetch and check"}));
  const signIn=await screen.findByRole("button",{name:"Sign in to Git"});await waitFor(()=>expect(signIn).toBeEnabled());await user.click(signIn);
  expect(native.signInFetch).toHaveBeenCalledWith("demo","/demo","https://git.example.invalid/repo",state.head,state.upstreamHead,expect.any(String));expect(native.signIn).not.toHaveBeenCalled();
  const retry=await screen.findByRole("button",{name:"Retry fetch"});expect(native.sync).toHaveBeenCalledTimes(2);await user.click(retry);
  expect(await screen.findByRole("button",{name:"Merge incoming commits"})).toBeEnabled();expect(native.sync).toHaveBeenCalledTimes(3);
});
it("serializes operations and ignores completion after closing",async()=>{
  let finish!:(value:SyncState)=>void;vi.mocked(native.sync).mockResolvedValueOnce(state).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const user=userEvent.setup();const view=render(<GitSync {...props}/>);await screen.findByRole("button",{name:"Merge incoming commits"});
  await user.click(screen.getByRole("button",{name:"Fetch and check"}));expect(screen.getByRole("button",{name:"Fetch and check"})).toBeDisabled();
  view.unmount();await act(async()=>finish(state));expect(props.onChanged).not.toHaveBeenCalled();expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
});
it("keeps a completed fetch when the initial inspection arrives late",async()=>{
  let inspect!:(value:SyncState)=>void;
  vi.mocked(native.sync).mockImplementationOnce(()=>new Promise(resolve=>{inspect=resolve;})).mockResolvedValueOnce({...state,behind:0,incoming:[]});
  const user=userEvent.setup();render(<GitSync {...props}/>);await user.click(screen.getByRole("button",{name:"Fetch and check"}));
  expect(await screen.findByRole("button",{name:"Review push preview"})).toBeEnabled();
  await act(async()=>inspect(state));expect(screen.queryByRole("button",{name:"Merge incoming commits"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Review push preview"})).toBeEnabled();
});
