import {FileIcon} from "./file-icon";
import { useEffect, useState } from "react";
import { Archive, GitBranch, RefreshCw } from "lucide-react";
import { native, type CommitDiff, type StashPreview } from "@/lib/native";
import { t, useLanguage } from "@/lib/i18n";
import { stashText } from "@/lib/stash-tools-messages";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { SideBySideDiff } from "./side-by-side-diff";

type Props = {workspaceId:string; path:string; blocked?:boolean; onBusyChange?:(busy:boolean)=>void; onChanged?:()=>void|Promise<void>};
type Area = "working"|"index"|"untracked";
const areaLabel = {working:"Saved working tree (all tracked changes)", index:"Saved index (staged changes)", untracked:"Saved unversioned files"};

export function StashDetails({workspaceId,path,stashHash,blocked=false,onBusyChange,onChanged}:Props & {stashHash:string}) {
  const {language,direction}=useLanguage(); const text=(key:string)=>{const value=stashText(key,language);return value===key?t(key):value;};
  const [open,setOpen]=useState(false); const [preview,setPreview]=useState<StashPreview|null>(null);
  const [area,setArea]=useState<Area>("working"); const [selected,setSelected]=useState("");
  const [diff,setDiff]=useState<CommitDiff|null>(null); const [error,setError]=useState(""); const [diffError,setDiffError]=useState("");
  const [refresh,setRefresh]=useState(0); const [branchName,setBranchName]=useState(""); const [branchReview,setBranchReview]=useState(false); const [busy,setBusy]=useState(false); const [result,setResult]=useState("");
  useEffect(()=>{
    if(!open)return; let active=true; setPreview(null);setError("");setSelected("");setBranchReview(false);setResult("");
    void native.stashPreview(workspaceId,path,stashHash).then(data=>{if(active){setPreview(data);setSelected(data.files.find(f=>f.area===area)?.path??"");}},err=>{if(active)setError(String(err));});
    return()=>{active=false;};
    // Changing the displayed group does not refetch immutable stash objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open,workspaceId,path,stashHash,refresh]);
  useEffect(()=>{
    if(!preview)return; setSelected(preview.files.find(f=>f.area===area)?.path??"");
  },[preview,area]);
  useEffect(()=>{
    setDiff(null);setDiffError(""); if(!open||!preview||!selected)return; let active=true;
    void native.stashDiff(workspaceId,path,preview.hash,selected,area).then(data=>{if(active)setDiff(data);},err=>{if(active)setDiffError(String(err));});
    return()=>{active=false;};
  },[open,workspaceId,path,preview,selected,area]);
  async function createBranch(){
    if(!preview||!branchName.trim()||busy)return;
    setBusy(true);onBusyChange?.(true);setError("");setResult("");
    try{const value=await native.stashBranch(workspaceId,path,preview.hash,branchName.trim(),preview.reviewToken);setResult(value);setBranchReview(false);await onChanged?.();}
    catch(err){setError(String(err)); await onChanged?.();}
    finally{setBusy(false);onBusyChange?.(false);}
  }
  return <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}>
    <DialogTrigger asChild><Button variant="outline" size="sm" disabled={blocked||!stashHash}><Archive className="size-3.5"/>{text("View stash")}</Button></DialogTrigger>
    <DialogContent dir={direction} className="flex h-[85vh] w-[94vw] max-w-[94vw] flex-col sm:max-w-[94vw]">
      <DialogHeader className="pe-8"><DialogTitle>{text("Stash preview")}</DialogTitle><DialogDescription>{text("Review saved working-tree, index, and unversioned changes separately.")}</DialogDescription><p dir="auto" className="truncate text-xs text-muted-foreground">{preview?.subject}</p></DialogHeader>
      <Tabs value={area} onValueChange={value=>setArea(value as Area)} dir={direction} className="min-h-0 flex-1 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList className="h-auto flex-wrap">{(["working","index","untracked"] as const).map(value=><TabsTrigger key={value} value={value}>{text(areaLabel[value])}</TabsTrigger>)}</TabsList>
        <Button variant="ghost" size="sm" disabled={busy} onClick={()=>setRefresh(n=>n+1)}><RefreshCw className="size-3.5"/>{t("Refresh")}</Button>
      </div>
      {error&&<p role="alert" className="text-sm text-destructive">{text(error)}</p>}
      {result&&<p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{text(result)}</p>}
      {!preview ? <p role="status" className="text-sm text-muted-foreground">{!error&&text("Loading stash…")}</p> : <>
        <TabsContent value={area} className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(12rem,28%)_minmax(0,1fr)] overflow-hidden rounded-lg border">
          <div className="min-h-0 overflow-auto border-e" aria-label={text(areaLabel[area])}>{preview.files.filter(f=>f.area===area).map(file=><button type="button" key={file.path} aria-pressed={selected===file.path} onClick={()=>setSelected(file.path)} className={`block w-full border-b px-3 py-2 text-start text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected===file.path?"bg-accent":"hover:bg-muted"}`}><span dir="ltr" className="flex items-center gap-2 min-w-0 font-mono" title={file.path}><FileIcon path={file.path}/><span className="truncate">{file.path}</span></span><span className="text-muted-foreground">{file.status}</span>{file.originalPath&&<span dir="ltr" className="block truncate font-mono text-muted-foreground">{file.originalPath} → {file.path}</span>}</button>)}{!preview.files.some(f=>f.area===area)&&<p className="p-3 text-xs text-muted-foreground">{text("No files in this group.")}</p>}</div>
          <div className="flex min-h-0 min-w-0 flex-col">{diffError?<p role="alert" className="p-3 text-sm text-destructive">{text(diffError)}</p>:!selected?<p className="p-3 text-xs text-muted-foreground">{text("Choose a file to inspect its saved changes.")}</p>:diff?<SideBySideDiff media={diff.media} key={`${area}:${selected}`} text={diff.text} staged={false} truncated={diff.truncated} revisions={{before:diff.beforeRevision?.slice(0,8)??"/dev/null",after:diff.afterRevision.slice(0,8)}}/>:<p role="status" className="p-3 text-xs text-muted-foreground">{t("Loading diff…")}</p>}</div>
        </TabsContent>
        <div className="shrink-0 space-y-2 border-t pt-3">
          {!branchReview?<Button variant="outline" size="sm" disabled={blocked||busy} onClick={()=>{setBranchReview(true);setBranchName("");setResult("");}}><GitBranch className="size-3.5"/>{text("Create branch from stash")}</Button>:<>
            <p className="text-xs text-muted-foreground">{text("Create and check out a new branch at the stash base, then restore its index and files. The original stash is kept.")}</p>
            <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="stash-branch-name">{t("Branch name")}</label><Input id="stash-branch-name" dir="ltr" className="max-w-sm" value={branchName} onChange={event=>setBranchName(event.target.value)} disabled={busy} maxLength={255}/><Button size="sm" disabled={busy||blocked||!branchName.trim()} onClick={()=>void createBranch()}>{text("Create branch from stash")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setBranchReview(false)}>{t("Cancel")}</Button></div>
          </>}
        </div>
      </>}
      </Tabs>
    </DialogContent>
  </Dialog>;
}

export function SelectedStash({workspaceId,path,paths,blocked=false,onBusyChange,onChanged}:Props & {paths:string[]}) {
  const {language,direction}=useLanguage();const text=(key:string)=>{const value=stashText(key,language);return value===key?t(key):value;};
  const [open,setOpen]=useState(false);const [chosen,setChosen]=useState<string[]>([]);const [message,setMessage]=useState("");const [token,setToken]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    if(!open)return;let active=true;setToken("");setError("");
    void native.tools(workspaceId,path).then(state=>{if(active)setToken(state.reviewToken);},err=>{if(active)setError(String(err));});
    return()=>{active=false;};
  },[open,workspaceId,path,refresh]);
  async function save(){
    if(!token||busy)return;setBusy(true);onBusyChange?.(true);setError("");
    try{await native.stashSelected(workspaceId,path,chosen,message,token);await onChanged?.();setOpen(false);}
    catch(err){setError(String(err));await onChanged?.();}
    finally{setBusy(false);onBusyChange?.(false);}
  }
  return <Dialog open={open} onOpenChange={value=>{if(busy)return;if(value){setChosen([...new Set(paths)]);setMessage("");}setOpen(value);}}>
    <DialogTrigger asChild><Button variant="outline" size="sm" disabled={blocked||!paths.length}><Archive className="size-3.5"/>{text("Stash selected files")}</Button></DialogTrigger>
    <DialogContent dir={direction} className="sm:max-w-xl">
      <DialogHeader className="pe-8"><DialogTitle>{text("Stash selected files")}</DialogTitle><DialogDescription>{text("Only the reviewed files will be saved and cleaned. Other local changes stay in place.")}</DialogDescription></DialogHeader>
      <div role="region" aria-label={text("Review selected paths")} className="max-h-48 overflow-auto rounded border p-2">{chosen.map(file=><p key={file} dir="ltr" className="truncate font-mono text-xs" title={file}>{file}</p>)}</div>
      <label className="space-y-1 text-xs"><span>{text("Stash message")}</span><Input dir="auto" value={message} onChange={event=>setMessage(event.target.value)} disabled={busy} maxLength={4096}/></label>
      {error&&<p role="alert" className="text-sm text-destructive">{text(error)}</p>}
      {!token&&!error&&<p role="status" className="text-xs text-muted-foreground">{text("Preparing stash review…")}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>{t("Cancel")}</Button>{error&&<Button variant="outline" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>{t("Refresh")}</Button>}<Button disabled={blocked||busy||!token||!chosen.length} onClick={()=>void save()}>{text("Stash selected files")}</Button></div>
    </DialogContent>
  </Dialog>;
}
