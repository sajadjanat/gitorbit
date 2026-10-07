import { useRef, useState } from "react";
import { LoaderCircle, GitMerge } from "lucide-react";
import { native, type GitConflict } from "@/lib/native";
import { t, useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ConflictEditor({ workspaceId, path, file, blocked, onBusyChange, onChanged }: {
  workspaceId: string; path: string; file: string; blocked: boolean;
  onBusyChange?: (busy: boolean) => void; onChanged: () => void;
}) {
  const { direction } = useLanguage();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GitConflict | null>(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guard = useRef(false);
  async function load() {
    setData(null); setBusy(true); setError("");
    try { const next = await native.conflict(workspaceId, path, file); setData(next); setResult(next.working); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!data || blocked || guard.current) return;
    guard.current = true; setBusy(true); onBusyChange?.(true); setError("");
    try { await native.toolAction(workspaceId, path, {action: "resolve-edit", target: "", paths: [file], name: result, reviewToken: data.reviewToken, force: false, checkout: false, mode: ""}); setOpen(false); }
    catch (e) { setError(String(e)); setData(null); }
    finally { guard.current = false; setBusy(false); onBusyChange?.(false); onChanged(); }
  }
  return <Dialog open={open} onOpenChange={(value) => { if (busy) return; setOpen(value); if (value) void load(); }}>
    <DialogTrigger asChild><Button variant="outline" size="sm" disabled={blocked || !file}><GitMerge className="size-3.5" />{t("Edit conflict")}</Button></DialogTrigger>
    <DialogContent dir={direction} showCloseButton={!busy} className="sm:max-w-6xl h-[88vh] flex flex-col">
      <DialogHeader><DialogTitle>{t("Resolve conflict")}</DialogTitle><DialogDescription><bdi dir="ltr">{file}</bdi> · {t("Edit the result, remove conflict markers, then save and mark resolved.")}</DialogDescription></DialogHeader>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{t(error)}</AlertDescription></Alert>}
      {busy && !data && <LoaderCircle className="size-5 animate-spin" />}
      {data && <>
        <div className="grid sm:grid-cols-3 gap-3 min-h-0 flex-1">{([["base", t("Base")], ["ours", t("Ours")], ["theirs", t("Theirs")]] as const).map(([side, label]) => <div className="flex flex-col min-h-0" key={side}><div className="flex items-center gap-2 pb-2"><label htmlFor={`conflict-${side}`} className="font-medium text-xs">{label}</label>{side !== "base" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setResult(data[side])}>{t("Use this version")}</Button>}</div><Textarea id={`conflict-${side}`} dir="ltr" readOnly value={data[side]} className="font-mono text-xs resize-none flex-1 whitespace-pre overflow-auto min-h-20" /></div>)}</div>
        <div className="min-h-0 flex-1 flex flex-col gap-2"><label htmlFor="conflict-result" className="font-medium text-xs">{t("Merged result")}</label><Textarea id="conflict-result" dir="ltr" value={result} disabled={busy} onChange={(e) => setResult(e.target.value)} className="font-mono text-xs resize-none flex-1 min-h-24" /></div>
        <p className="text-xs text-muted-foreground">{t("During rebase, ours is the new base and theirs is the replayed commit.")}</p>
      </>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("Cancel")}</Button>{!data && !busy ? <Button onClick={() => void load()}>{t("Refresh")}</Button> : <Button disabled={busy || blocked || !data || /^(<{7}|={7}|>{7})( |$)/m.test(result)} onClick={() => void save()}>{busy && <LoaderCircle className="size-4 animate-spin" />}{t("Save and mark resolved")}</Button>}</div>
    </DialogContent>
  </Dialog>;
}
