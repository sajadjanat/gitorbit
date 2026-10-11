import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { GitAuthentication } from "./git-authentication";
import { GitSync } from "./git-sync";
import { native, type SyncState } from "@/lib/native";
import { classifyGitError, redactGitError } from "@/lib/git-errors";
import { t } from "@/lib/i18n";

export function GitRecovery({ workspaceId, path, error, purpose = "push", expected, blocked, onBusyChange, onChanged, onRetry, onReviewChanges, onReviewOperations }: {
  workspaceId: string; path: string; error: string; purpose?: "push" | "pull";
  expected?: {head: string; upstreamHead: string}; blocked: boolean; onBusyChange?: (busy: boolean) => void;
  onChanged: () => void; onRetry: () => void; onReviewChanges?: () => void; onReviewOperations?: () => void;
}) {
  const kind = classifyGitError(error);
  const [state, setState] = useState<SyncState | null>(null);
  const [inspectionError, setInspectionError] = useState("");
  useEffect(() => {
    if (kind !== "authentication" || expected) return;
    let cancelled = false;
    setState(null); setInspectionError("");
    void native.sync(workspaceId, path, "inspect").then(value => { if (!cancelled) setState(value); }, reason => { if (!cancelled) setInspectionError(String(reason)); });
    return () => { cancelled = true; };
  }, [workspaceId, path, kind, expected]);
  if (kind === "sync") return <GitSync {...{workspaceId,path,error,blocked,onBusyChange,onChanged,onReviewChanges,onReviewOperations}} purpose={purpose} onReady={onRetry}/>;
  const plan = expected ?? state;
  if (kind === "authentication" && plan) return <GitAuthentication {...{workspaceId,path,error,blocked,onBusyChange,onRetry}} expectedHead={plan.head} expectedUpstreamHead={plan.upstreamHead} purpose={purpose === "pull" ? "fetch" : "push"} retryLabel={purpose==="pull"?"Retry pull":undefined}/>;
  const title = ({authentication:"Git sign-in required", changes:"Review local changes", operation:"Finish the current Git operation", upstream:"Choose a branch and upstream", stale:"Refresh and review again", network:"Could not reach the remote", unknown:"Git needs attention"} as const)[kind];
  const description = ({authentication:"Reading the branch for sign-in…", changes:"Save or commit your local changes, then retry the update.", operation:"Review conflicts in Version Control, then continue or abort the operation in Repository tools.", upstream:"Select a local branch and configure its upstream before updating.", stale:"The repository changed since your last review. Refresh before trying again.", network:"Check your connection and remote address, then retry.", unknown:"Review the Git details below, then retry or open the repository folder."} as const)[kind];
  return <Alert className="mx-4 my-3 w-auto shrink-0" role="alert"><AlertTitle>{t(title)}</AlertTitle><AlertDescription className="flex flex-col gap-2">
    <p>{t(description)}</p>
    {inspectionError&&<p className="text-destructive break-words">{t(redactGitError(inspectionError))}</p>}
    <div className="flex flex-wrap gap-2">
      {(kind === "changes" || kind === "operation") && onReviewChanges && <Button size="sm" disabled={blocked} onClick={onReviewChanges}>{t("Review in Version Control")}</Button>}
      {(kind === "upstream" || kind === "operation") && onReviewOperations && <Button size="sm" variant="outline" disabled={blocked} onClick={onReviewOperations}>{t("Review repository operations")}</Button>}
      <Button size="sm" variant="outline" disabled={blocked} onClick={onRetry}>{t(purpose === "pull" ? "Retry pull" : "Refresh and review")}</Button>
      {kind === "unknown" && <Button size="sm" variant="ghost" onClick={()=>void native.openRepository(workspaceId,path).catch(reason=>setInspectionError(String(reason)))}>{t("Open folder")}</Button>}
    </div>
    <details className="text-xs"><summary className="cursor-pointer">{t("Git error details")}</summary><pre dir="ltr" className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all">{redactGitError(error)}</pre></details>
  </AlertDescription></Alert>;
}
