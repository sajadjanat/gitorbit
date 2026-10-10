import { useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { native, type FileHistory as HistoryData, type FileHistoryCommit, type FileBlame, type CommitDiff } from "@/lib/native";
import { t, useLanguage } from "@/lib/i18n";
import { fileHistoryText } from "@/lib/file-history-messages";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { SideBySideDiff } from "./side-by-side-diff";

export function FileHistory({ workspaceId, path, file, blocked = false, open:controlled, onOpenChange, hideTrigger=false }: {workspaceId: string; path: string; file: string; blocked?: boolean;open?:boolean;onOpenChange?:(value:boolean)=>void;hideTrigger?:boolean}) {
  const { language, direction, locale } = useLanguage();
  const text = (key: string) => { const value = fileHistoryText(key, language); return value === key ? t(key) : value; };
  const [localOpen, setLocalOpen] = useState(false);
  const open=controlled??localOpen;const setOpen=(value:boolean)=>{setLocalOpen(value);onOpenChange?.(value);};
  const [tab, setTab] = useState("history");
  const [limit, setLimit] = useState(200);
  const [refresh, setRefresh] = useState(0);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [selected, setSelected] = useState<FileHistoryCommit | null>(null);
  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [annotations, setAnnotations] = useState<FileBlame | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [annotationError, setAnnotationError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setHistory(null); setHistoryError(""); setSelected(null);
    void native.fileHistory(workspaceId, path, file, limit).then(data => {
      if (!active) return;
      setHistory(data); setSelected(data.commits[0] ?? null);
    }, error => { if (active) setHistoryError(String(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, workspaceId, path, file, limit, refresh]);

  useEffect(() => {
    setDiff(null); setDetailError("");
    if (!open || !selected) return;
    let active = true;
    void native.fileHistoryDiff(workspaceId, path, selected.path, selected.hash).then(data => { if (active) setDiff(data); }, error => { if (active) setDetailError(String(error)); });
    return () => { active = false; };
  }, [open, workspaceId, path, selected]);

  useEffect(() => {
    setAnnotations(null); setAnnotationError("");
    if (!open || tab !== "annotate" || !selected) return;
    if (selected.status === "D") { setAnnotationError("This file was deleted in the selected commit. Choose an earlier commit to annotate it."); return; }
    let active = true;
    void native.fileBlame(workspaceId, path, selected.path, selected.hash).then(data => { if (active) setAnnotations(data); }, error => { if (active) setAnnotationError(String(error)); });
    return () => { active = false; };
  }, [open, tab, workspaceId, path, selected]);

  const formatDate = (seconds: number) => new Intl.DateTimeFormat(locale, {calendar: "gregory", dateStyle: "short", timeStyle: "short"}).format(new Date(seconds * 1000));
  const message = (value: string, alert = false) => <p role={alert ? "alert" : "status"} className={`p-4 text-sm ${alert ? "text-destructive" : "text-muted-foreground"}`}>{text(value)}</p>;

  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) { setTab("history"); setLimit(200); } }}>
    {!hideTrigger&&<DialogTrigger asChild><Button variant="ghost" size="sm" disabled={blocked || !file}><History className="size-3.5" />{text("History")}</Button></DialogTrigger>}
    <DialogContent dir={direction} className="flex h-[85vh] w-[94vw] min-w-0 max-w-[94vw] flex-col gap-3 sm:max-w-[94vw]">
      <DialogHeader className="shrink-0 pe-8">
        <DialogTitle>{text("File history")}</DialogTitle>
        <DialogDescription>{text("Committed history, including detected renames.")}</DialogDescription>
        <p dir="ltr" className="truncate text-start font-mono text-xs text-muted-foreground" title={file}>{file}</p>
      </DialogHeader>
      <Tabs dir={direction} value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-2">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <TabsList><TabsTrigger value="history">{text("History")}</TabsTrigger><TabsTrigger value="annotate">{text("Annotate")}</TabsTrigger></TabsList>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => setRefresh(n => n+1)}><RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />{text("Refresh history")}</Button>
        </div>
        {history?.shallow && <p className="text-xs text-amber-600 dark:text-amber-400">{text("Shallow clone: older history may be unavailable.")}</p>}
        {loading ? message("Loading file history…") : historyError ? message(historyError, true) : history && !history.commits.length ? message("No committed history for this file on HEAD.") : <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(12rem,25%)_minmax(0,1fr)] overflow-hidden rounded-lg border">
          <aside className="min-h-0 overflow-auto border-e" aria-label={text("File history")}>
            {history?.commits.map(commit => <button key={commit.hash} type="button" aria-pressed={selected?.hash === commit.hash} onClick={() => setSelected(commit)} className={`block w-full border-b px-3 py-2 text-start text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected?.hash === commit.hash ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"}`}>
              <span className="block truncate font-medium" title={commit.subject}>{commit.subject}</span>
              <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground"><span dir="ltr" className="font-mono">{commit.hash.slice(0,8)}</span><span>{commit.author}</span></span>
              <time className="mt-1 block text-muted-foreground" dateTime={new Date(commit.timestamp * 1000).toISOString()}>{formatDate(commit.timestamp)}</time>
              {commit.previousPath && <span dir="ltr" className="mt-1 block truncate font-mono text-muted-foreground" title={`${commit.previousPath} → ${commit.path}`}>{commit.previousPath} → {commit.path}</span>}
            </button>)}
            {history?.hasMore && (limit < 2000 ? <Button className="m-2" variant="outline" size="sm" onClick={() => setLimit(n => Math.min(n+200,2000))}>{text("Load more commits")}</Button> : <p className="p-3 text-xs text-muted-foreground">{text("History limited to 2,000 commits.")}</p>)}
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <TabsContent value="history" className="m-0 flex min-h-0 min-w-0 flex-1 flex-col">
              {!selected ? message("Choose a commit to inspect its changes.") : detailError ? message(detailError, true) : diff ? <SideBySideDiff key={`${selected.hash}:${selected.path}`} text={diff.text} truncated={diff.truncated} staged={false} revisions={{before: diff.beforeRevision?.slice(0,8) ?? "/dev/null", after: diff.afterRevision.slice(0,8)}} /> : message("Loading diff…")}
            </TabsContent>
            <TabsContent value="annotate" className="m-0 flex min-h-0 min-w-0 flex-1 flex-col">
              <p className="shrink-0 border-b px-3 py-2 text-xs text-muted-foreground">{text("Annotations show the selected committed revision; local edits are excluded.")}</p>
              {annotationError ? message(annotationError, true) : !selected ? message("Choose a commit to inspect its changes.") : annotations ? <>
                <div role="region" dir="ltr" className="min-h-0 flex-1 overflow-auto" aria-label={text("Annotate")}>
                  {annotations.lines.length ? <table className="w-max min-w-full border-collapse text-start text-xs"><thead className="sticky top-0 z-10 bg-muted"><tr>{["Author", "Commit", "Date", "Original line", "Line", "Source"].map(label => <th key={label} scope="col" className="border-b px-2 py-2 text-start font-medium">{text(label)}</th>)}</tr></thead><tbody>{annotations.lines.map(line => <tr key={line.line} className="border-b border-border/40 hover:bg-muted/40">
                    <td className="whitespace-nowrap px-2 py-0.5" dir="auto">{line.author}</td><td className="px-2 font-mono" title={line.hash}>{line.hash.slice(0,8)}</td><td className="whitespace-nowrap px-2 text-muted-foreground">{formatDate(line.timestamp)}</td><td className="px-2 text-end font-mono text-muted-foreground" title={line.path}>{line.originalLine}</td><td className="px-2 text-end font-mono text-muted-foreground">{line.line}</td><td className="whitespace-pre px-3 font-mono">{line.text || " "}</td>
                  </tr>)}</tbody></table> : message("Empty file.")}
                </div>
                {annotations.truncated && <p className="shrink-0 border-t px-3 py-2 text-xs text-amber-600 dark:text-amber-400">{text("Annotations limited to the first 10,000 lines.")}</p>}
              </> : message("Loading annotations…")}
            </TabsContent>
          </div>
        </div>}
      </Tabs>
    </DialogContent>
  </Dialog>;
}
