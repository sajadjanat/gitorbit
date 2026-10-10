import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { native } from "@/lib/native";
import { t, useLanguage } from "@/lib/i18n";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

type Review = { reviewToken:string; paths:string[] };
export function DeleteFiles({workspaceId,path,paths,blocked,onBusyChange,onChanged,open:controlled,onOpenChange,hideTrigger=false}:{
  workspaceId:string; path:string; paths:string[]; blocked:boolean; onBusyChange?:(busy:boolean)=>void;
  onChanged:(message?:string)=>void; open?:boolean; onOpenChange?:(open:boolean)=>void; hideTrigger?:boolean;
}) {
  const {direction}=useLanguage();
  const [localOpen,setLocalOpen]=useState(false);
  const open=controlled??localOpen;
  const setOpen=(value:boolean)=>{setLocalOpen(value);onOpenChange?.(value);};
  const [review,setReview]=useState<Review|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [retry,setRetry]=useState(0);
  const guard=useRef(false);
  const [selection,setSelection]=useState<string[]|null>(null);
  // Keep the reviewed selection when a refresh clears missing/deleted rows.
  // A retry must explicitly review those same paths, not silently retarget others.
  useEffect(()=>{setSelection(open?[...paths]:null);},[open,workspaceId,path]);
  useEffect(()=>{
    let cancelled=false;
    setReview(null);setError("");
    if(open&&selection){
      setLoading(true);
      void native.deleteFilesReview(workspaceId,path,selection).then(
        result=>{if(!cancelled)setReview(result);},
        e=>{if(!cancelled)setError(String(e));},
      ).finally(()=>{if(!cancelled)setLoading(false);});
    }
    return()=>{cancelled=true;};
  },[open,workspaceId,path,selection,retry]);
  async function apply(){
    if(!review||guard.current||blocked)return;
    guard.current=true;setBusy(true);onBusyChange?.(true);setError("");
    let result:string|undefined;
    try{result=await native.deleteFiles(workspaceId,path,review);setOpen(false);}
    catch(e){setError(String(e));setReview(null);}
    finally{guard.current=false;setBusy(false);onBusyChange?.(false);onChanged(result);}
  }
  const displayedPaths=review?.paths??selection??paths;
  const label=displayedPaths.length===1?t("Delete file"):t("Delete files");
  return <Dialog open={open} onOpenChange={value=>{if(!guard.current&&!loading)setOpen(value);}}>
    {!hideTrigger&&<DialogTrigger asChild><Button variant="outline" size="sm" disabled={blocked||!paths.length}><Trash2 className="size-3.5"/>{paths.length===1?t("Delete file"):t("Delete files")}</Button></DialogTrigger>}
    <DialogContent dir={direction} className="sm:max-w-lg" showCloseButton={!busy&&!loading}>
      <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{displayedPaths.length===1?t("This file will be permanently deleted from the project folder. It will not go to the Recycle Bin."):t("These files will be permanently deleted from the project folder. They will not go to the Recycle Bin.")}</DialogDescription></DialogHeader>
      <ul dir="ltr" className="max-h-56 overflow-auto rounded-md border p-3 space-y-1 text-xs font-mono">{displayedPaths.map(p=><li key={p} className="break-all">{p}</li>)}</ul>
      {loading&&<p role="status" className="text-sm text-muted-foreground flex items-center gap-2"><LoaderCircle className="size-4 animate-spin"/>{t("Reviewing files…")}</p>}
      {error&&<Alert variant="destructive" role="alert"><AlertDescription>{t(error)}</AlertDescription></Alert>}
      <DialogFooter><Button variant="outline" disabled={busy||loading} onClick={()=>setOpen(false)}>{t("Cancel")}</Button>
        {!review&&!loading?<Button variant="outline" disabled={blocked||busy} onClick={()=>setRetry(n=>n+1)}>{t("Refresh")}</Button>:<Button variant="destructive" disabled={!review||blocked||busy||loading} onClick={()=>void apply()}>{busy&&<LoaderCircle className="size-4 animate-spin"/>}{label}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
