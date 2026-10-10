import { useEffect, useState } from "react";
import { FileDown, FileUp, RefreshCw } from "lucide-react";
import { native, type PatchPreview } from "@/lib/native";
import { t, useLanguage } from "@/lib/i18n";
import { patchText } from "@/lib/patch-tools-messages";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function PatchTools({workspaceId,path,paths,blocked=false,onBusyChange,onChanged}:{workspaceId:string;path:string;paths:string[];blocked?:boolean;onBusyChange?:(busy:boolean)=>void;onChanged?:()=>void|Promise<void>}){
  const {language,direction}=useLanguage();const text=(key:string)=>{const value=patchText(key,language);return value===key?t(key):value;};
  const [mode,setMode]=useState<"export"|"import"|null>(null);const [chosen,setChosen]=useState<string[]>([]);const [scope,setScope]=useState("working");const [token,setToken]=useState("");
  const [patchPath,setPatchPath]=useState("");const [preview,setPreview]=useState<PatchPreview|null>(null);const [error,setError]=useState("");const [result,setResult]=useState("");const [busy,setBusy]=useState(false);const [checking,setChecking]=useState(false);const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    if(mode!=="export")return;let active=true;setToken("");setError("");
    void native.tools(workspaceId,path).then(state=>{if(active)setToken(state.reviewToken);},err=>{if(active)setError(String(err));});return()=>{active=false;};
  },[mode,workspaceId,path,refresh]);
  useEffect(()=>{
    if(mode!=="import"||!patchPath)return;let active=true;setPreview(null);setError("");setChecking(true);
    void native.previewPatch(workspaceId,path,patchPath).then(data=>{if(active)setPreview(data);},err=>{if(active)setError(String(err));}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};
  },[mode,workspaceId,path,patchPath,refresh]);
  function begin(value:"export"|"import") {setChosen([...new Set(paths)]);setScope("working");setPatchPath("");setPreview(null);setError("");setResult("");setMode(value);}
  async function choose(){try{const selected=await native.choosePatch();if(selected){setPatchPath(selected);setResult("");}}catch(err){setError(String(err));}}
  async function save(){
    if(!token||busy)return;setBusy(true);onBusyChange?.(true);setError("");setResult("");
    try{const patch=await native.exportPatch(workspaceId,path,chosen,scope==="index",token);const destination=await native.savePatch(patch.text);if(destination)setResult(`${text("Patch saved.")} ${destination}`);}
    catch(err){setError(String(err));}finally{setBusy(false);onBusyChange?.(false);}
  }
  async function apply(){
    if(!preview?.canApply||busy)return;setBusy(true);onBusyChange?.(true);setError("");setResult("");
    try{const value=await native.applyPatch(workspaceId,path,preview.patchPath,preview.reviewToken);setResult(value);setPreview(null);await onChanged?.();}
    catch(err){setError(String(err));setPreview(null);await onChanged?.();}finally{setBusy(false);onBusyChange?.(false);}
  }
  return <>
    <Button variant="outline" size="sm" disabled={blocked||!paths.length} onClick={()=>begin("export")}><FileDown className="size-3.5"/>{text("Export patch")}</Button>
    <Button variant="outline" size="sm" disabled={blocked} onClick={()=>begin("import")}><FileUp className="size-3.5"/>{text("Apply patch")}</Button>
    <Dialog open={mode!==null} onOpenChange={value=>{if(!value&&!busy)setMode(null);}}><DialogContent dir={direction} className="max-h-[85vh] overflow-auto sm:max-w-2xl">
      <DialogHeader className="pe-8"><DialogTitle>{text(mode==="export"?"Export patch":"Apply patch")}</DialogTitle><DialogDescription>{text(mode==="export"?"Export the reviewed selected files as a Git patch, including binary changes.":"Review the patch before applying it to the working tree. Nothing is committed automatically.")}</DialogDescription></DialogHeader>
      {mode==="export"?<>
        <div className="space-y-1"><label id="patch-scope" className="text-xs">{text("Patch scope")}</label><Select value={scope} onValueChange={value=>setScope(value??"working")} disabled={busy}><SelectTrigger aria-labelledby="patch-scope"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="working">{text("Working tree (unstaged changes)")}</SelectItem><SelectItem value="index">{text("Index (staged changes)")}</SelectItem></SelectContent></Select></div>
        <div role="region" aria-label={text("Review selected paths")} className="max-h-48 overflow-auto rounded border p-2">{chosen.map(file=><p key={file} dir="ltr" className="truncate font-mono text-xs" title={file}>{file}</p>)}</div>
        {!token&&!error&&<p role="status" className="text-xs text-muted-foreground">{text("Preparing patch review…")}</p>}
      </>:<>
        <Button variant="outline" disabled={busy||checking} onClick={()=>void choose()}>{text("Choose patch file")}</Button>
        {patchPath&&<p dir="ltr" className="truncate font-mono text-xs text-muted-foreground" title={patchPath}>{patchPath}</p>}
        {checking&&<p role="status" className="text-xs text-muted-foreground">{text("Checking patch…")}</p>}
        {preview&&<>
          <p role="status" className={`text-xs ${preview.canApply?"text-emerald-600 dark:text-emerald-400":"text-destructive"}`}>{text(preview.canApply?"Patch check passed.":"Patch cannot be applied to the current files.")}</p>
          {preview.error&&<p role="alert" className="whitespace-pre-wrap text-xs text-destructive">{text(preview.error)}</p>}
          <div role="region" aria-label={text("Review selected paths")} className="max-h-32 overflow-auto rounded border p-2">{preview.files.map(file=><p key={file} dir="ltr" className="truncate font-mono text-xs" title={file}>{file}</p>)}</div>
          <pre dir="ltr" aria-label={text("Patch statistics")} className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-xs">{preview.stat}</pre>
          {preview.summary&&<pre dir="ltr" aria-label={text("Patch summary")} className="max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-xs">{preview.summary}</pre>}
          <p className="text-xs text-muted-foreground">{text("Previous tracked changes are backed up in a stash before applying. New files stay unversioned; stage and commit separately.")}</p>
        </>}
      </>}
      {error&&<p role="alert" className="whitespace-pre-wrap text-sm text-destructive">{text(error)}</p>}
      {result&&<p role="status" className="break-all text-xs text-emerald-600 dark:text-emerald-400">{text(result)}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={()=>setMode(null)}>{t("Close")}</Button>{(error||patchPath)&&<Button variant="outline" disabled={busy||checking} onClick={()=>setRefresh(n=>n+1)}><RefreshCw className="size-3.5"/>{t("Refresh")}</Button>}{mode==="export"?<Button disabled={blocked||busy||!token||!chosen.length} onClick={()=>void save()}>{text("Save patch file")}</Button>:<Button disabled={blocked||busy||checking||!preview?.canApply} onClick={()=>void apply()}>{text("Apply patch")}</Button>}</div>
    </DialogContent></Dialog>
  </>;
}
