import { useEffect, useState } from "react";
import {FileIcon} from "./file-icon";
import { EyeOff, LoaderCircle, RefreshCw } from "lucide-react";
import { native, type IgnoreFilesInfo, type IgnoredInventory } from "@/lib/native";
import { t, number } from "@/lib/i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {workspaceId: string; path: string; paths: string[]; blocked?: boolean; onBusyChange?: (busy: boolean) => void; onChanged?: () => void};
export function IgnoreFiles({workspaceId, path, paths, blocked = false, onBusyChange, onChanged}: Props) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("shared");
  const [info, setInfo] = useState<IgnoreFilesInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const selection = JSON.stringify(paths);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setInfo(null); setLoading(true); setError("");
    void native.ignoreFilesReview(workspaceId, path, JSON.parse(selection) as string[], target).then((value) => {
      if (!cancelled) setInfo(value);
    }, (e) => {if (!cancelled) setError(String(e));}).finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled = true;};
  }, [open, workspaceId, path, selection, target, reload]);
  async function save() {
    if (!info || blocked || loading || busy) return;
    const reviewed = info;
    setBusy(true); onBusyChange?.(true); setError("");
    try {await native.ignoreFilesApply(workspaceId, path, {reviewToken: reviewed.reviewToken, target: reviewed.target, paths: reviewed.paths}); setOpen(false); onChanged?.();}
    catch (e) {setError(String(e));setInfo(null);}
    finally {setBusy(false);onBusyChange?.(false);}
  }
  return <Dialog open={open} onOpenChange={(value) => {if (!busy) setOpen(value);}}>
    <DialogTrigger asChild><Button variant="outline" size="sm" disabled={blocked || !paths.length}><EyeOff className="size-3.5" />{t("Ignore selected")}</Button></DialogTrigger>
    <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col min-h-0" onEscapeKeyDown={(e) => {if (busy) e.preventDefault();}} onPointerDownOutside={(e) => {if (busy) e.preventDefault();}}>
      <DialogHeader><DialogTitle>{t("Ignore selected files")}</DialogTitle><DialogDescription>{t("Add exact rules for unversioned files. Files stay on disk; tracked files are never removed from Git.")}</DialogDescription></DialogHeader>
      <label className="text-xs space-y-1"><span>{t("Ignore rules location")}</span><Select value={target} disabled={busy} onValueChange={(value) => {setInfo(null);setTarget(value);}}><SelectTrigger className="w-full" aria-label={t("Ignore rules location")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="shared">{t("Shared · .gitignore")}</SelectItem><SelectItem value="local">{t("Only this clone · .git/info/exclude")}</SelectItem></SelectContent></Select></label>
      <p className="text-xs text-muted-foreground">{t(target === "shared" ? "Shared rules appear as a file change for you to review and commit." : "Local rules affect only this clone and are not committed.")}</p>
      {loading && <p className="text-xs text-muted-foreground">{t("Reviewing ignore rules…")}</p>}
      {error && <Alert variant="destructive"><AlertDescription>{t(error)}</AlertDescription></Alert>}
      {info && <div className="overflow-auto min-h-0 flex-1 rounded-md border bg-muted/30 p-3 space-y-1" aria-label={t("Exact ignore patterns")}>{info.patterns.map((pattern) => <code key={pattern} dir="ltr" className="block whitespace-pre text-xs">{pattern}</code>)}</div>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("Cancel")}</Button>{error && <Button variant="outline" disabled={busy || loading} onClick={() => setReload((value) => value + 1)}><RefreshCw className="size-3.5" />{t("Refresh")}</Button>}<Button disabled={blocked || busy || loading || !info} onClick={() => void save()}>{busy && <LoaderCircle className="size-3.5 animate-spin" />}{t("Save ignore rules")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function ShowIgnored({workspaceId, path, blocked = false}: {workspaceId: string; path: string; blocked?: boolean}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<IgnoredInventory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;setLoading(true);setState(null);setError("");
    void native.ignoredFiles(workspaceId, path).then((value) => {if (!cancelled) setState(value);}, (e) => {if (!cancelled) setError(String(e));}).finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled = true;};
  }, [open, workspaceId, path, reload]);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" size="sm" disabled={blocked}><EyeOff className="size-3.5" />{t("Show ignored files")}</Button></DialogTrigger>
    <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col min-h-0">
      <DialogHeader><DialogTitle>{t("Ignored files")}</DialogTitle><DialogDescription>{t("Untracked files excluded by repository, local, or global Git ignore rules. Tracked files are always shown in Version Control.")}</DialogDescription></DialogHeader>
      {loading && <p className="text-xs text-muted-foreground">{t("Reading ignored files…")}</p>}
      {error && <Alert variant="destructive"><AlertDescription>{t(error)}</AlertDescription></Alert>}
      {state && <>
        <p className="text-xs text-muted-foreground">{t("{count} ignored files", {count: state.files.length})}</p>
        {state.hasMore && <Alert><AlertDescription>{t("Showing the first 2000 ignored files. More files are excluded by Git.")}</AlertDescription></Alert>}
        {state.files.length ? <div className="flex-1 min-h-0 overflow-auto rounded-md border p-3 space-y-1" aria-label={t("Ignored file list")}>{state.files.map((file, index) => <div key={file} className="flex gap-2 text-xs"><span className="text-muted-foreground min-w-8 text-end shrink-0">{number(index + 1)}</span><FileIcon path={file}/><code dir="ltr" className="break-all">{file}</code></div>)}</div> : <p className="text-xs text-muted-foreground">{t("No ignored untracked files were found.")}</p>}
      </>}
      <DialogFooter><Button variant="outline" disabled={loading} onClick={() => setReload((value) => value + 1)}><RefreshCw className="size-3.5" />{t("Refresh")}</Button><Button variant="outline" onClick={() => setOpen(false)}>{t("Close")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
