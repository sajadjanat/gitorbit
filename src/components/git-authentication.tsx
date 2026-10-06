import { useEffect, useRef, useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { native, type AuthenticationInfo } from "@/lib/native";
import { t } from "@/lib/i18n";
import { redactGitError } from "@/lib/git-errors";

export function GitAuthentication({ workspaceId, path, expectedHead, expectedUpstreamHead, error, blocked, onBusyChange, onRetry }: {
  workspaceId: string; path: string; expectedHead: string; expectedUpstreamHead: string;
  error: string; blocked: boolean; onBusyChange?: (busy: boolean) => void; onRetry: () => void;
}) {
  const [info, setInfo] = useState<AuthenticationInfo | null>(null);
  const [issue, setIssue] = useState("");
  const [status, setStatus] = useState<"ready" | "signing-in" | "signed-in">("ready");
  const [cancelling, setCancelling] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const session = useRef<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    let cancelled = false;
    setInfo(null); setIssue("");
    void native.authentication(workspaceId, path).then(
      result => { if (!cancelled) setInfo(result); },
      reason => { if (!cancelled) setIssue(String(reason)); },
    );
    return () => { cancelled = true; };
  }, [workspaceId, path, refresh]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (session.current) void native.cancelSignIn(workspaceId, path, session.current).catch(() => {});
    };
  }, [workspaceId, path]);

  async function signIn() {
    if (!info?.canSignIn || blocked || session.current) return;
    const id = crypto.randomUUID();
    session.current = id;
    setStatus("signing-in"); setIssue(""); setCancelling(false); onBusyChange?.(true);
    try {
      await native.signIn(workspaceId, path, info.target, expectedHead, expectedUpstreamHead, id);
      if (alive.current) setStatus("signed-in");
    } catch (reason) {
      if (alive.current) { setStatus("ready"); setIssue(String(reason)); }
    } finally {
      session.current = null;
      if (alive.current) setCancelling(false);
      onBusyChange?.(false);
    }
  }

  async function cancel() {
    if (!session.current) return;
    setCancelling(true);
    try { await native.cancelSignIn(workspaceId, path, session.current); }
    catch { setCancelling(false); setIssue(t("Could not cancel sign-in. Close the Git login window or wait for the timeout.")); }
  }

  return <Alert className="mx-4 mt-3 w-auto" role="alert">
    <KeyRound />
    <AlertTitle>{status === "signed-in" ? t("Git sign-in completed") : t("Git sign-in required")}</AlertTitle>
    <AlertDescription className="min-w-0 gap-2">
      {info?.host && <span dir="ltr" className="break-all font-mono text-xs">{info.host}</span>}
      <p>{status === "signed-in" ? t("Click Retry push to send the reviewed commits. Your local changes are preserved.") : status === "signing-in" ? t("Complete sign-in in the Git window or browser. You can cancel at any time.") : t("Your Git credentials are missing or expired. Sign in, then retry the push.")}</p>
      {status === "ready" && <p className="text-xs text-muted-foreground">{t("Use your Git account and an access token if the server requires one. Git Credential Manager handles your credentials; GitOrbit does not receive your password.")}</p>}
      {info?.reason && <p>{t(info.reason)}</p>}
      {issue && <p className="break-words text-destructive">{t(issue)}</p>}
      <div className="flex flex-wrap gap-2">
        {status === "signing-in" ? <>
          <span className="inline-flex items-center gap-2 text-xs"><LoaderCircle className="size-3.5 animate-spin" />{t("Signing in…")}</span>
          <Button variant="outline" size="sm" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? t("Cancelling…") : t("Cancel sign-in")}</Button>
        </> : <>
          {status === "signed-in" ? <Button size="sm" disabled={blocked} onClick={onRetry}>{t("Retry push")}</Button> : <Button size="sm" disabled={blocked || !info?.canSignIn} onClick={() => void signIn()}>{t("Sign in to Git")}</Button>}
          {status === "ready" && !info?.canSignIn && <Button size="sm" variant="outline" onClick={() => void native.signInSetup().catch(reason => setIssue(String(reason)))}>{t("Set up Git sign-in")}</Button>}
          {status === "ready" && <Button size="sm" variant="ghost" disabled={blocked} onClick={() => { setRefresh(value => value + 1); }}>{t("Recheck sign-in setup")}</Button>}
        </>}
      </div>
      <details className="min-w-0 text-xs"><summary className="cursor-pointer">{t("Git error details")}</summary><pre dir="ltr" className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all">{redactGitError(error)}</pre></details>
    </AlertDescription>
  </Alert>;
}
