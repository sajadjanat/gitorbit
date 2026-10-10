import { useEffect, useRef, useState } from "react";
import { Archive, RefreshCw } from "lucide-react";
import { Tabs } from "radix-ui";
import { date, number, t, useLanguage } from "@/lib/i18n";
import { native, type Shelves as ShelfState, type ShelfRequest, type StashPreview, type CommitDiff } from "@/lib/native";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { SideBySideDiff } from "./side-by-side-diff";
import { ContextActions, ActionMenuButton } from "./context-actions";

type Props={workspaceId:string;path:string;blocked:boolean;onBusyChange?:(busy:boolean)=>void;onChanged:()=>void};
type Area="working"|"index"|"untracked";
const areas:Record<Area,string>={working:"Working tree",index:"Staged",untracked:"Unversioned Files"};

export function ShelveFiles({workspaceId,path,paths,blocked,onBusyChange,onChanged,open:controlled,onOpenChange,hideTrigger=false}:Props & {paths:string[];open?:boolean;onOpenChange?:(open:boolean)=>void;hideTrigger?:boolean}) {
  const {direction}=useLanguage();const[localOpen,setLocalOpen]=useState(false);const open=controlled??localOpen;
  const setOpen=(value:boolean)=>{setLocalOpen(value);onOpenChange?.(value);};
  const [review,setReview]=useState<{token:string;paths:string[]}|null>(null);const [message,setMessage]=useState("");const[error,setError]=useState("");const[busy,setBusy]=useState(false);const guard=useRef(false);const[refresh,setRefresh]=useState(0);
  const selection=JSON.stringify([...new Set(paths)].sort());
  useEffect(()=>{if(!open)return;let active=true;setReview(null);setError("");
    void native.shelves(workspaceId,path).then(data=>{if(active)setReview({token:data.reviewToken,paths:JSON.parse(selection)});},e=>{if(active)setError(String(e));});return()=>{active=false;};
  },[open,workspaceId,path,selection,refresh]);
  async function save(){if(!review||!message.trim()||guard.current||blocked)return;guard.current=true;setBusy(true);onBusyChange?.(true);setError("");
    try{await native.shelfAction(workspaceId,path,{action:"save",id:"",reviewToken:review.token,paths:review.paths,message:message.trim()});setMessage("");setOpen(false);}
    catch(e){setError(String(e));setReview(null);}finally{guard.current=false;setBusy(false);onBusyChange?.(false);onChanged();}
  }
  return <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}>
    {!hideTrigger&&<DialogTrigger asChild><Button variant="outline" size="sm" disabled={blocked||!paths.length}><Archive className="size-3.5"/>{t("Shelve selected…")}</Button></DialogTrigger>}
    <DialogContent dir={direction} showCloseButton={!busy} className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("Shelve selected files")}</DialogTitle><DialogDescription>{t("Save selected files on the local shelf and restore them to HEAD. Staging and new files are preserved; other changes stay in place.")}</DialogDescription></DialogHeader>
      <label className="space-y-2 text-xs"><span>{t("Shelf name")}</span><Input value={message} maxLength={4096} disabled={busy} onChange={e=>setMessage(e.target.value)} autoFocus/></label>
      <ul dir="ltr" className="max-h-52 overflow-auto rounded border p-3 text-xs font-mono break-all">{(review?.paths??JSON.parse(selection) as string[]).map(p=><li key={p}>{p}</li>)}</ul>
      {error&&<p role="alert" className="text-xs text-destructive whitespace-pre-wrap">{error.split("\n").map(line=>t(line)).join("\n")}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={()=>setOpen(false)}>{t("Cancel")}</Button>{!review&&<Button variant="outline" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>{t("Refresh")}</Button>}<Button disabled={busy||blocked||!review||!review.paths.length||!message.trim()} onClick={()=>void save()}>{busy?t("Saving…"):t("Shelve files")}</Button></div>
    </DialogContent>
  </Dialog>;
}

export function Shelves(props:Props & {revision?:string;open?:boolean;onOpenChange?:(open:boolean)=>void;hideTrigger?:boolean}) {
  const{workspaceId,path,blocked,onBusyChange,onChanged,revision,open:controlled,onOpenChange,hideTrigger=false}=props;
  const{direction}=useLanguage();const[localOpen,setLocalOpen]=useState(false);const open=controlled??localOpen;const setOpen=(value:boolean)=>{setLocalOpen(value);onOpenChange?.(value);};
  const[state,setState]=useState<ShelfState|null>(null);const[selected,setSelected]=useState("");const[preview,setPreview]=useState<StashPreview|null>(null);const[area,setArea]=useState<Area>("working");const[file,setFile]=useState("");const[diff,setDiff]=useState<CommitDiff|null>(null);
  const[error,setError]=useState("");const[diffError,setDiffError]=useState("");const[notice,setNotice]=useState("");const[refresh,setRefresh]=useState(0);const[busy,setBusy]=useState(false);const[pending,setPending]=useState<ShelfRequest|null>(null);const guard=useRef(false);
  useEffect(()=>{if(!open)return;let active=true;setState(null);setPending(null);void native.shelves(workspaceId,path).then(data=>{if(active){setState(data);setSelected(old=>data.entries.some(s=>s.id===old)?old:data.entries[0]?.id??"");}},e=>{if(active)setError(String(e));});return()=>{active=false;};},[open,workspaceId,path,refresh,revision]);
  useEffect(()=>{setPreview(null);setFile("");if(!open||!selected||!state)return;let active=true;void native.shelfPreview(workspaceId,path,selected).then(data=>{if(active)setPreview(data);},e=>{if(active)setError(String(e));});return()=>{active=false;};},[open,workspaceId,path,selected,state]);
  useEffect(()=>{setFile(preview?.files.find(f=>f.area===area)?.path??"");},[preview,area]);
  useEffect(()=>{setDiff(null);setDiffError("");if(!open||!preview||!file)return;let active=true;void native.shelfDiff(workspaceId,path,selected,file,area).then(data=>{if(active)setDiff(data);},e=>{if(active)setDiffError(String(e));});return()=>{active=false;};},[open,workspaceId,path,selected,preview,file,area]);
  function review(action:"apply"|"delete",id:string){if(!state||busy||blocked)return;setPending({action,id,reviewToken:state.reviewToken,paths:[],message:""});}
  async function execute(){if(!pending||guard.current||blocked)return;guard.current=true;setBusy(true);onBusyChange?.(true);setError("");setNotice("");
    try{setNotice(await native.shelfAction(workspaceId,path,pending));}catch(e){setError(String(e));}finally{guard.current=false;setBusy(false);onBusyChange?.(false);setPending(null);setRefresh(n=>n+1);onChanged();}
  }
  useEffect(()=>{if(open){setError("");setNotice("");}},[open]);
  const entry=state?.entries.find(s=>s.id===selected);
  return <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}>
    {!hideTrigger&&<DialogTrigger asChild><Button variant="outline" size="sm" disabled={blocked}><Archive className="size-3.5"/>{t("Shelf")}</Button></DialogTrigger>}
    <DialogContent dir={direction} showCloseButton={!busy} className="flex h-[88vh] w-[96vw] max-w-[96vw] flex-col gap-3 sm:max-w-[96vw] overflow-hidden">
      <DialogHeader className="pe-8"><DialogTitle>{t("Shelf")}</DialogTitle><DialogDescription>{t("Saved locally in this repository. Unshelving keeps the shelf available and restores staged changes too.")}</DialogDescription></DialogHeader>
      <div className="flex items-center justify-between gap-2 text-xs"><span>{t("{count} shelves",{count:state?.entries.length??0})}</span><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setRefresh(n=>n+1)}><RefreshCw className="size-3.5"/>{t("Refresh")}</Button></div>
      {error&&<p role="alert" className="text-xs text-destructive whitespace-pre-wrap">{error.split("\n").map(line=>t(line)).join("\n")}</p>}{notice&&<p role="status" className="text-xs text-muted-foreground">{t(notice)}</p>}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row overflow-hidden rounded-lg border">
        <div className="max-h-36 md:max-h-none md:w-64 md:shrink-0 overflow-y-auto border-b md:border-b-0 md:border-e" aria-label={t("Saved shelves")}>
          {state?.entries.map(s=>{const actions=[{label:t("Preview shelf"),run:()=>setSelected(s.id)},{label:t("Unshelve…"),run:()=>review("apply",s.id),disabled:busy||blocked},{label:t("Delete shelf…"),run:()=>review("delete",s.id),disabled:busy||blocked,destructive:true,separator:true}];return <ContextActions key={s.id} label={s.title} actions={actions}><div className={`flex items-center border-b ${selected===s.id?"bg-accent":"hover:bg-muted/40"}`}><button disabled={busy} className="min-w-0 flex-1 p-3 text-start text-xs focus-visible:outline-ring" aria-pressed={selected===s.id} onClick={()=>setSelected(s.id)}><span className="block truncate font-medium" dir="auto">{s.title}</span><span className="text-muted-foreground">{date(new Date(s.timestamp*1000),{dateStyle:"short",timeStyle:"short"})}</span></button><ActionMenuButton label={s.title} actions={actions}/></div></ContextActions>;})}
          {state&&!state.entries.length&&<p className="p-4 text-xs text-muted-foreground">{t("No shelves yet. Select changed files and choose Shelve selected.")}</p>}{!state&&!error&&<p className="p-4 text-xs text-muted-foreground">{t("Loading…")}</p>}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {entry&&<><div className="flex flex-wrap items-center gap-2 border-b p-2"><span className="min-w-0 flex-1 truncate text-xs font-medium" dir="auto">{entry.title}</span><Button size="sm" variant="outline" disabled={busy||blocked||!preview} onClick={()=>review("apply",entry.id)}>{t("Unshelve…")}</Button><Button size="sm" variant="ghost" disabled={busy||blocked} onClick={()=>review("delete",entry.id)}>{t("Delete shelf…")}</Button></div>
            <Tabs.Root dir={direction} value={area} onValueChange={value=>setArea(value as Area)} className="flex min-h-0 flex-1 flex-col"><Tabs.List className="flex flex-wrap gap-1 border-b p-2" aria-label={t("Shelf file groups")}>{(Object.keys(areas) as Area[]).map(a=><Tabs.Trigger key={a} value={a} asChild><Button size="sm" variant={area===a?"secondary":"ghost"}>{t(areas[a])}<span className="text-muted-foreground tabular-nums">{number(preview?.files.filter(f=>f.area===a).length??0)}</span></Button></Tabs.Trigger>)}</Tabs.List>
            <Tabs.Content value={area} className="flex min-h-0 flex-1 flex-col sm:flex-row outline-none"><div className="max-h-32 sm:max-h-none sm:w-56 sm:shrink-0 overflow-auto border-b sm:border-b-0 sm:border-e">{preview?.files.filter(f=>f.area===area).map(f=><button key={f.path} onClick={()=>setFile(f.path)} title={f.originalPath?`${f.originalPath} → ${f.path}`:f.path} aria-pressed={file===f.path} className={`block w-full truncate p-2 text-start text-xs font-mono focus-visible:outline-ring ${file===f.path?"bg-accent":"hover:bg-muted"}`} dir="ltr">{f.path}</button>)}</div><div className="flex flex-1 min-h-0 min-w-0 flex-col">{diffError?<p role="alert" className="p-3 text-xs text-destructive">{t(diffError)}</p>:diff?<SideBySideDiff text={diff.text} staged={area==="index"} truncated={diff.truncated} revisions={{before:diff.beforeRevision?.slice(0,8)??"/dev/null",after:diff.afterRevision.slice(0,8)}}/>:<p className="p-3 text-xs text-muted-foreground">{file?t("Loading diff…"):t("No files in this group.")}</p>}</div></Tabs.Content></Tabs.Root>
          </>}
        </div>
      </div>
      {pending&&<div className="shrink-0 border-t pt-3 space-y-2"><p className="text-sm font-medium">{pending.action==="apply"?t("Restore this shelf?"):t("Delete this shelf?")}</p><p className="text-xs break-words" dir="auto">{state?.entries.find(s=>s.id===pending.id)?.title}</p><p className="text-xs text-muted-foreground">{pending.action==="apply"?t("Unrelated changes stay in place. Overlapping local files block restoration. Conflicts keep the original shelf available."):t("Remove it from the shelf list. A recovery reference keeps the saved contents.")}</p><div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={()=>setPending(null)}>{t("Cancel")}</Button><Button variant={pending.action==="delete"?"destructive":"default"} disabled={busy||blocked} onClick={()=>void execute()}>{busy?t("Working…"):pending.action==="apply"?t("Unshelve"):t("Delete shelf")}</Button></div></div>}
    </DialogContent>
  </Dialog>;
}
