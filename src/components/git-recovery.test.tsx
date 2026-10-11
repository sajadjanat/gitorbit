import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type SyncState } from "@/lib/native";
import { setLanguage, t } from "@/lib/i18n";
import { GitRecovery } from "./git-recovery";
vi.mock("@/lib/native",()=>({native:{sync:vi.fn(),authentication:vi.fn(),signInFetch:vi.fn(),signIn:vi.fn(),cancelSignIn:vi.fn()}}));
const state:SyncState={reviewToken:"review",head:"a".repeat(40),upstreamHead:"b".repeat(40),sourceBranch:"main",remote:"origin",destinationBranch:"main",ahead:0,behind:0,dirty:0,conflicts:0,operation:null,mergeHead:null,blockedReason:null,incoming:[],note:null};
const props={workspaceId:"w",path:"/repo",blocked:false,onChanged:vi.fn(),onRetry:vi.fn(),onReviewChanges:vi.fn(),onReviewOperations:vi.fn()};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(native.sync).mockResolvedValue(state);vi.mocked(native.authentication).mockResolvedValue({target:"https://git.example.invalid/repo",host:"git.example.invalid",canSignIn:true,reason:null});vi.mocked(native.signInFetch).mockResolvedValue();});
it.each(["en","fa","ar","zh"] as const)("offers fetch-only login after pull failure and never automatically retries in %s",async language=>{
  setLanguage(language);const user=userEvent.setup();render(<GitRecovery {...props} purpose="pull" error="Authentication failed"/>);
  const signIn=await screen.findByRole("button",{name:t("Sign in to Git")});await waitFor(()=>expect(signIn).toBeEnabled());
  await user.click(signIn);
  expect(native.signInFetch).toHaveBeenCalledWith("w","/repo","https://git.example.invalid/repo",state.head,state.upstreamHead,expect.any(String));
  expect(native.signIn).not.toHaveBeenCalled();expect(props.onRetry).not.toHaveBeenCalled();
  await user.click(await screen.findByRole("button",{name:t("Retry pull")}));expect(props.onRetry).toHaveBeenCalledOnce();
});
it("routes dirty files and ongoing operations to their existing in-app tools",async()=>{
  const user=userEvent.setup();const view=render(<GitRecovery {...props} purpose="pull" error="Skipped: commit or stash local changes before pulling."/>);
  await user.click(screen.getByRole("button",{name:"Review in Version Control"}));expect(props.onReviewChanges).toHaveBeenCalledOnce();
  view.rerender(<GitRecovery {...props} purpose="pull" error="Finish the current Git operation before pulling."/>);
  await user.click(screen.getByRole("button",{name:"Review repository operations"}));expect(props.onReviewOperations).toHaveBeenCalledOnce();
  expect(native.sync).not.toHaveBeenCalled();
});
it("requires explicit retry for connectivity errors and redacts Git details",async()=>{
  const user=userEvent.setup();render(<GitRecovery {...props} purpose="pull" error="unable to access https://user:secret@git.example.invalid/repo: connection timed out"/>);
  expect(screen.getByText("Could not reach the remote")).toBeInTheDocument();expect(screen.getByRole("alert")).not.toHaveTextContent("user:secret");
  expect(props.onRetry).not.toHaveBeenCalled();await user.click(screen.getByRole("button",{name:"Retry pull"}));expect(props.onRetry).toHaveBeenCalledOnce();
});
