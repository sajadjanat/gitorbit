import {useEffect, useState} from "react";
import {FileCode2, X} from "lucide-react";
import {native, type CommitDiff, type CommitFile} from "@/lib/native";
import {t, useLanguage} from "@/lib/i18n";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription} from "@/components/ui/dialog";
import {SideBySideDiff} from "@/components/side-by-side-diff";
import {FileHistory} from "@/components/file-history";

export function HistoryCommitDetails({workspaceId,path,hash,subject,open:controlled,onOpenChange}: {workspaceId:string;path:string;hash:string;subject:string;open?:boolean;onOpenChange?:(value:boolean)=>void}) {
  const {direction}=useLanguage();
  const [localOpen,setLocalOpen]=useState(false);const open=controlled??localOpen;const setOpen=(value:boolean)=>{setLocalOpen(value);onOpenChange?.(value);};
  const [files,setFiles]=useState<CommitFile[]|null>(null);
  const [selected,setSelected]=useState<CommitFile|null>(null);
  const [diff,setDiff]=useState<CommitDiff|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{if(!open)return;let cancelled=false;setFiles(null);setSelected(null);setError("");void native.historyCommitFiles(workspaceId,path,hash).then(value=>{if(!cancelled)setFiles(value);},e=>{if(!cancelled)setError(String(e));});return()=>{cancelled=true;};},[open,workspaceId,path,hash]);
  useEffect(()=>{setDiff(null);if(!selected)return;let cancelled=false;setError("");void native.historyCommitDiff(workspaceId,path,hash,selected.path).then(value=>{if(!cancelled)setDiff(value);},e=>{if(!cancelled)setError(String(e));});return()=>{cancelled=true;};},[workspaceId,path,hash,selected]);
  return <><Button size="sm" variant="outline" onClick={()=>setOpen(true)}><FileCode2 className="size-3.5"/>{t("Changed files")}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent dir={direction} className="sm:max-w-6xl h-[85vh] flex flex-col gap-2 p-4 overflow-hidden">
    <DialogHeader><DialogTitle dir="auto">{subject}</DialogTitle><DialogDescription dir="ltr" className="font-mono truncate">{hash}</DialogDescription></DialogHeader>
    {error&&<p role="alert" className="text-destructive text-sm">{t(error)}</p>}
    <div className="flex flex-1 min-h-0 flex-col sm:flex-row border rounded overflow-hidden"><div className="sm:w-72 sm:shrink-0 border-e overflow-auto max-h-[30%] sm:max-h-none">
      {!files&&<p className="p-3 text-muted-foreground">{t("Loading…")}</p>}{files?.map(file=><button key={file.path} dir="ltr" title={file.path} className={`w-full px-3 py-2 text-start text-xs flex gap-2 ${selected?.path===file.path?"bg-accent":"hover:bg-muted"}`} onClick={()=>setSelected(file)}><code className="text-muted-foreground shrink-0">{file.status}</code><span className="truncate font-mono">{file.path}</span></button>)}{files?.length===0&&<p className="p-3 text-muted-foreground">{t("No files changed in this commit.")}</p>}
    </div><div className="flex flex-1 min-h-0 min-w-0 flex-col">{selected?<><div className="px-3 py-2 border-b flex items-center gap-2"><bdi dir="ltr" className="font-mono truncate flex-1 text-xs">{selected.path}</bdi><FileHistory workspaceId={workspaceId} path={path} file={selected.path}/><Button size="icon" variant="ghost" aria-label={t("Close diff")} onClick={()=>setSelected(null)}><X className="size-4"/></Button></div>{diff?<SideBySideDiff text={diff.text} staged={false} truncated={diff.truncated} revisions={{before:diff.beforeRevision?.slice(0,7)||"/dev/null",after:hash.slice(0,7)}}/>:!error&&<p className="p-4 text-muted-foreground">{t("Loading diff…")}</p>}</>:<p className="m-auto p-4 text-muted-foreground text-sm">{t("Select a file to review its diff.")}</p>}</div></div>
  </DialogContent></Dialog></>;
}
