import { useEffect, useState } from "react";
import { native, type PartialStageHunks } from "@/lib/native";
import { t, useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SideBySideDiff } from "@/components/side-by-side-diff";
import { Checkbox } from "@/components/ui/checkbox";

export function PartialStage({ workspaceId, path, file, staged, blocked, onBusyChange, onChanged }: {workspaceId: string; path: string; file: string; staged: boolean; blocked: boolean; onBusyChange?: (busy: boolean) => void; onChanged: () => void}) {
  const { direction } = useLanguage();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PartialStageHunks | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(0);
  const [lineMode, setLineMode] = useState(false);
  const [selectedLines, setSelectedLines] = useState<number[]>([]);
  useEffect(() => {setSelectedLines([]);}, [selected, data]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false; setData(null); setSelected(0); setSelectedLines([]);
    void native.partialStage(workspaceId, path, file, staged).then(result => {if (!cancelled) setData(result);}, e => {if (!cancelled) setError(String(e));});
    return () => {cancelled = true;};
  }, [open, workspaceId, path, file, staged, reload]);
  async function apply() {
    if (!data || busy || blocked) return;
    setBusy(true); onBusyChange?.(true); setError("");
    try {
      if (lineMode) await native.stageHunk(workspaceId, path, file, staged, selected, data.reviewToken, selectedLines);
      else await native.stageHunk(workspaceId, path, file, staged, selected, data.reviewToken);
      onChanged();
    }
    catch (e) {setError(String(e));}
    finally {setBusy(false); onBusyChange?.(false); setReload(n => n + 1);}
  }
  return <><Button size="sm" variant="outline" disabled={blocked} onClick={() => {setError(""); setOpen(true);}}>{t(staged ? "Unstage change blocks" : "Stage change blocks")}</Button>
    <Dialog open={open} onOpenChange={value => {if (!busy) setOpen(value);}}><DialogContent dir={direction} showCloseButton={!busy} className="sm:max-w-6xl h-[82vh] flex flex-col gap-3 overflow-hidden">
      <DialogHeader><DialogTitle>{t(staged ? "Unstage change blocks" : "Stage change blocks")}</DialogTitle><DialogDescription dir="ltr" className="truncate">{file}</DialogDescription></DialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{t(error)}</AlertDescription></Alert>}
      {data?.unavailable && <p className="text-muted-foreground text-sm">{t(data.unavailable)}</p>}
      {!data && !error && <p>{t("Loading diff…")}</p>}
      {!!data && !data.unavailable && !data.hunks.length && <p>{t("No text difference in this view.")}</p>}
      {!!data?.hunks.length && <><div className="flex flex-wrap items-center gap-2"><label htmlFor="change-block">{t("Change block")}</label><select id="change-block" className="border rounded bg-background px-2 py-1 text-sm" disabled={busy} value={selected} onChange={e => setSelected(Number(e.target.value))}>{data.hunks.map((_, i) => <option key={i} value={i}>{i + 1} / {data.hunks.length}</option>)}</select><label className="flex items-center gap-2 text-xs"><Checkbox checked={lineMode} disabled={busy} onCheckedChange={value => setLineMode(value === true)}/>{t("Select individual lines")}</label><Button size="sm" disabled={busy || blocked || (lineMode && !selectedLines.length)} onClick={() => void apply()}>{t(lineMode ? staged ? "Unstage selected lines" : "Stage selected lines" : staged ? "Unstage this block" : "Stage this block")}</Button></div>
      {lineMode && <div dir="ltr" className="max-h-[28vh] overflow-auto border rounded p-2 space-y-1" aria-label={t("Changed lines")}>
        {data.hunks[selected].split("\n").map((line, index, all) => index > all.findIndex(value => value.startsWith("@@ ")) && /^[+-]/.test(line) ? <label key={index} className={`flex items-start gap-2 text-xs font-mono ${line.startsWith("+")?"text-emerald-600 dark:text-emerald-400":"text-red-600 dark:text-red-400"}`}><Checkbox className="shrink-0" aria-label={t("Select changed line {line}",{line:index+1})} checked={selectedLines.includes(index)} disabled={busy} onCheckedChange={value => setSelectedLines(old => value === true ? [...old,index] : old.filter(item => item !== index))}/><span className="whitespace-pre">{line}</span></label> : null)}
      </div>}
      <div className="flex-1 min-h-0 flex flex-col"><SideBySideDiff text={data.hunks[selected]} staged={staged} truncated={false}/></div></>}
      <Button variant="ghost" className="self-end" disabled={busy} onClick={() => setReload(n => n + 1)}>{t("Refresh")}</Button>
    </DialogContent></Dialog></>;
}
