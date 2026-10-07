import { useRef, useState } from "react";
import { LoaderCircle, Undo2 } from "lucide-react";
import { t, useLanguage } from "@/lib/i18n";
import { native, type GitToolAction, type GitToolRequest } from "@/lib/native";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toolLabel } from "@/components/git-tools";

export function FileGitAction({ workspaceId, path, paths, action, blocked, onBusyChange, onChanged }: {
  workspaceId: string; path: string; paths: string[]; action: GitToolAction; blocked: boolean;
  onBusyChange?: (busy: boolean) => void; onChanged: () => void;
}) {
  const { direction } = useLanguage();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<GitToolRequest | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  async function review() {
    setRequest(null); setError(""); setBusy(true);
    try {
      const state = await native.tools(workspaceId, path);
      setRequest({ action, paths: [...paths], target: "", name: "", mode: "", force: false, checkout: false, reviewToken: state.reviewToken });
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!request || guard.current || blocked) return;
    guard.current = true; setBusy(true); onBusyChange?.(true); setError("");
    try { await native.toolAction(workspaceId, path, request); setOpen(false); }
    catch (e) { setError(String(e)); setRequest(null); }
    finally { guard.current = false; setBusy(false); onBusyChange?.(false); onChanged(); }
  }
  return <Dialog open={open} onOpenChange={(value) => { if (guard.current || busy) return; setOpen(value); if (value) void review(); }}>
    <DialogTrigger asChild><Button variant="outline" size="sm" disabled={blocked || !paths.length}><Undo2 className="size-3.5" />{toolLabel(action)}</Button></DialogTrigger>
    <DialogContent dir={direction} showCloseButton={!busy} className="sm:max-w-lg">
      <DialogHeader><DialogTitle>{toolLabel(action)}</DialogTitle><DialogDescription>{action === "rollback" ? t("Restore selected tracked files to HEAD, including staged changes. A stash backup preserves tracked work. Added files become unversioned instead of being deleted.") : action === "resolve-mark" ? t("Stage the selected files as resolved. Review their contents before continuing the operation.") : t("Replace selected conflicted files with one side and stage them. During rebase, ours is the new base and theirs is the replayed commit.")}</DialogDescription></DialogHeader>
      <ul dir="ltr" className="max-h-56 overflow-auto rounded-md border p-3 space-y-1 text-xs font-mono">{(request?.paths || paths).map((p) => <li key={p} className="break-all">{p}</li>)}</ul>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{t(error)}</AlertDescription></Alert>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("Cancel")}</Button>{!request && !busy ? <Button disabled={blocked} onClick={() => void review()}>{t("Refresh")}</Button> : <Button disabled={busy || blocked || !request} onClick={() => void apply()}>{busy && <LoaderCircle className="size-4 animate-spin" />}{toolLabel(action)}</Button>}</div>
    </DialogContent>
  </Dialog>;
}
