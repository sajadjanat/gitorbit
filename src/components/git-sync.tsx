import { useEffect, useRef, useState } from "react";
import { GitMerge, LoaderCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { native, type SyncState } from "@/lib/native";
import { t } from "@/lib/i18n";
import { isAuthenticationError, redactGitError } from "@/lib/git-errors";
import { GitAuthentication } from "@/components/git-authentication";

export function GitSync({workspaceId, path, error, blocked, onBusyChange, onChanged, onReady, onReviewChanges}: {
  workspaceId: string; path: string; error: string; blocked: boolean;
  onBusyChange?: (busy: boolean) => void; onChanged: () => void; onReady: () => void; onReviewChanges?: () => void;
}) {
  const [data, setData] = useState<SyncState | null>(null);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [confirmAbort, setConfirmAbort] = useState(false);
  const alive = useRef(true), inFlight = useRef(false), request = useRef(0);
  useEffect(() => {
    let cancelled = false; alive.current = true; const id = ++request.current;
    void native.sync(workspaceId, path, "inspect").then(result => { if (!cancelled && id === request.current) setData(result); }, reason => { if (!cancelled && id === request.current) setIssue(String(reason)); });
    return () => { cancelled = true; alive.current = false; };
  }, [workspaceId, path]);
  async function act(action: "fetch" | "integrate" | "abort") {
    if (blocked || inFlight.current || (action !== "fetch" && !data)) return;
    inFlight.current = true; ++request.current; setBusy(true); setIssue(""); onBusyChange?.(true);
    try {
      const result = await native.sync(workspaceId, path, action, data?.head, action === "abort" ? data?.mergeHead ?? "" : data?.upstreamHead, data?.reviewToken);
      if (alive.current) { setData(result); setFresh(action !== "abort"); setConfirmAbort(false); onChanged(); }
    } catch (reason) {
      if (alive.current) { setIssue(String(reason)); setFresh(false); }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); onBusyChange?.(false); }
  }
  const disabled = blocked || busy, operation = Boolean(data?.operation);
  const canIntegrate = fresh && data && data.behind > 0 && !data.dirty && !operation && !data.blockedReason;
  if (data && isAuthenticationError(issue)) return <GitAuthentication workspaceId={workspaceId} path={path} error={issue} expectedHead={data.head} expectedUpstreamHead={data.upstreamHead} purpose="fetch" blocked={disabled} onBusyChange={onBusyChange} onRetry={() => void act("fetch")} />;
  return <>
    <Alert className="mx-4 mt-3 w-auto shrink-0 text-start" role="alert">
      <GitMerge />
      <AlertTitle>{operation ? t("Finish the current Git operation") : t("Sync before pushing")}</AlertTitle>
      <AlertDescription className="min-w-0 flex flex-col gap-2 [&_p:not(:last-child)]:mb-0">
        {data ? <>
          <p>{t("{ahead} local · {behind} incoming", {ahead:data.ahead, behind:data.behind})}</p>
          <p>{operation && data.operation !== "merge" ? t("Finish the current Git operation using Git before syncing.") : operation ? t("Review conflicts, stage the resolved files, and commit the merge before pushing.") : data.blockedReason ? t(data.blockedReason) : data.dirty ? t("Commit or stash local file changes before syncing. Your commits are preserved.") : !data.behind ? t("No incoming commits. Refresh the push preview to continue.") : data.ahead > 0 ? t("Both branches have new commits. Merge the incoming commits, review the result, then push.") : t("Your branch is behind. Pull the incoming commits, then review the push preview.")}</p>
          {data.behind > 0 && !operation && !data.blockedReason && <p className="text-xs text-muted-foreground">{t("Fetch updates the preview. Sync preserves existing commits and never force-pushes or stashes files.")}</p>}
        </> : <p>{t("The remote has new work. Fetch and check it before trying again.")}</p>}
        {issue && <p className="break-words text-destructive">{t(redactGitError(issue))}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => void act("fetch")}>{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{t("Fetch and check")}</Button>
          {data && !operation && data.behind > 0 && <Button size="sm" disabled={disabled || !canIntegrate} onClick={() => void act("integrate")}>{t(data.ahead > 0 ? "Merge incoming commits" : "Pull incoming commits")}</Button>}
          {data && !operation && !data.behind && !data.blockedReason && <Button size="sm" disabled={disabled || !fresh} onClick={onReady}>{t("Review push preview")}</Button>}
          {(operation || Boolean(data?.dirty)) && onReviewChanges && <Button size="sm" disabled={disabled} onClick={onReviewChanges}>{t("Review in Version Control")}</Button>}
          {data?.operation === "merge" && <Button size="sm" variant="outline" disabled={disabled} onClick={() => setConfirmAbort(true)}>{t("Abort merge")}</Button>}
          {(data?.blockedReason || (operation && data?.operation !== "merge")) && <Button size="sm" variant="outline" onClick={() => void native.openRepository(workspaceId, path).catch(reason => setIssue(String(reason)))}>{t("Open folder")}</Button>}
        </div>
        {data && data.incoming.length > 0 && <details className="min-w-0 text-xs"><summary className="cursor-pointer">{t("Incoming commits ({count})", {count:data.behind})}</summary><ul className="mt-2 max-h-36 overflow-auto space-y-1">{data.incoming.map(commit => <li key={commit.hash} className="flex gap-2"><code dir="ltr" className="shrink-0 text-muted-foreground">{commit.hash.slice(0,8)}</code><span dir="auto" className="min-w-0 break-words">{commit.subject}</span></li>)}</ul></details>}
        {(error || data?.note) && <details className="min-w-0 text-xs"><summary className="cursor-pointer">{t("Git error details")}</summary><pre dir="ltr" className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all">{redactGitError(data?.note ?? error)}</pre></details>}
      </AlertDescription>
    </Alert>
    <Dialog open={confirmAbort} onOpenChange={setConfirmAbort}>
      <DialogContent><DialogHeader><DialogTitle>{t("Abort this merge?")}</DialogTitle><DialogDescription>{t("This restores the branch before the merge and discards edits made to resolve its conflicts. Existing commits remain intact.")}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirmAbort(false)}>{t("Cancel")}</Button><Button variant="destructive" disabled={disabled} onClick={() => void act("abort")}>{t("Abort merge")}</Button></DialogFooter></DialogContent>
    </Dialog>
  </>;
}
