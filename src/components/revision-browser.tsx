import {FileIcon} from "./file-icon";
import {FileContentPreview} from "./media-preview";
import {useEffect,useState} from "react";
import {File,Folder,FolderTree,GitCommitHorizontal,Link,RefreshCw} from "lucide-react";
import {native,type RevisionTree,type RevisionBlob,type FileBlame} from "@/lib/native";
import {t,useLanguage} from "@/lib/i18n";
import {revisionText} from "@/lib/revision-browser-messages";
import {Button} from "./ui/button";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger} from "./ui/dialog";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "./ui/tabs";
import {FileHistory} from "./file-history";

export function RevisionBrowser({workspaceId,path,revision,subject,blocked=false}:{workspaceId:string;path:string;revision:string;subject?:string;blocked?:boolean}){
  const{language,direction,locale}=useLanguage();const text=(key:string)=>{const value=revisionText(key,language);return value===key?t(key):value;};
  const[open,setOpen]=useState(false);const[directory,setDirectory]=useState("");const[tree,setTree]=useState<RevisionTree|null>(null);const[selected,setSelected]=useState("");const[tab,setTab]=useState("file");const[blob,setBlob]=useState<RevisionBlob|null>(null);const[annotations,setAnnotations]=useState<FileBlame|null>(null);const[treeError,setTreeError]=useState("");const[blobError,setBlobError]=useState("");const[annotationError,setAnnotationError]=useState("");const[refresh,setRefresh]=useState(0);
  useEffect(()=>{setDirectory("");setSelected("");setTree(null);setBlob(null);setTab("file");},[workspaceId,path,revision]);
  useEffect(()=>{
    if(!open)return;let active=true;setTree(null);setTreeError("");setSelected("");
    void native.revisionTree(workspaceId,path,revision,directory).then(data=>{if(active)setTree(data);},err=>{if(active)setTreeError(String(err));});return()=>{active=false;};
  },[open,workspaceId,path,revision,directory,refresh]);
  const entry=tree?.entries.find(file=>file.path===selected);
  useEffect(()=>{
    setBlob(null);setBlobError("");setTab("file");if(!open||!selected||entry?.kind==="submodule")return;let active=true;
    void native.revisionBlob(workspaceId,path,revision,selected).then(data=>{if(active)setBlob(data);},err=>{if(active)setBlobError(String(err));});return()=>{active=false;};
  },[open,workspaceId,path,revision,selected,entry?.kind]);
  useEffect(()=>{
    setAnnotations(null);setAnnotationError("");if(!open||!selected||tab!=="annotate"||entry?.kind!=="file")return;let active=true;
    void native.fileBlame(workspaceId,path,selected,revision).then(data=>{if(active)setAnnotations(data);},err=>{if(active)setAnnotationError(String(err));});return()=>{active=false;};
  },[open,workspaceId,path,revision,selected,tab,entry?.kind]);
  const parts=directory?directory.split("/"):[];
  return <Dialog open={open} onOpenChange={value=>{setOpen(value);if(value){setDirectory("");setSelected("");}}}>
    <DialogTrigger asChild><Button variant="outline" size="sm" disabled={blocked||!revision}><FolderTree className="size-3.5"/>{text("Browse revision")}</Button></DialogTrigger>
    <DialogContent dir={direction} className="flex h-[85vh] w-[94vw] max-w-[94vw] min-w-0 flex-col gap-3 sm:max-w-[94vw]">
      <DialogHeader className="shrink-0 pe-8"><DialogTitle>{text("Repository at revision")}</DialogTitle><DialogDescription>{text("Browse committed files without changing your branch or local files.")}</DialogDescription>{subject&&<p dir="auto" className="truncate text-xs">{subject}</p>}<p dir="ltr" className="truncate font-mono text-xs text-muted-foreground">{revision}</p></DialogHeader>
      <div className="flex shrink-0 items-center justify-between gap-2"><nav aria-label={text("Revision folders")} className="flex min-w-0 flex-wrap items-center gap-1"><Button variant="ghost" size="sm" onClick={()=>setDirectory("")}>{text("Repository root")}</Button>{parts.map((part,index)=><span key={index} className="flex min-w-0 items-center gap-1"><span aria-hidden="true">/</span><Button variant="ghost" size="sm" dir="ltr" className="max-w-48 truncate font-mono text-xs" onClick={()=>setDirectory(parts.slice(0,index+1).join("/"))}>{part}</Button></span>)}</nav><Button variant="ghost" size="sm" onClick={()=>setRefresh(n=>n+1)}><RefreshCw className="size-3.5"/>{t("Refresh")}</Button></div>
      {treeError?<p role="alert" className="text-sm text-destructive">{text(treeError)}</p>:!tree?<p role="status" className="text-sm text-muted-foreground">{text("Loading revision…")}</p>:<div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(12rem,25%)_minmax(0,1fr)] overflow-hidden rounded-lg border">
        <aside className="min-h-0 overflow-auto border-e" aria-label={text("Revision folders")}>
          {!tree.entries.length&&<p className="p-3 text-xs text-muted-foreground">{text("Empty directory.")}</p>}
          {tree.entries.map(file=>{const Icon=file.kind==="directory"?Folder:file.kind==="submodule"?GitCommitHorizontal:file.kind==="symlink"?Link:File;return <button type="button" key={file.path} aria-pressed={file.kind==="directory"?undefined:selected===file.path} className={`flex w-full min-w-0 items-center gap-2 border-b px-3 py-2 text-start text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected===file.path?"bg-accent":"hover:bg-muted"}`} onClick={()=>file.kind==="directory"?setDirectory(file.path):setSelected(file.path)}>{file.kind==="file"?<FileIcon path={file.path}/>:<Icon className="size-3.5 shrink-0 text-muted-foreground"/>}<span dir="ltr" className="truncate font-mono" title={file.path}>{file.name}</span></button>;})}
          {tree.truncated&&<p className="p-3 text-xs text-amber-600 dark:text-amber-400">{text("Directory limited to the first 5,000 entries.")}</p>}
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{!entry?<p className="p-4 text-sm text-muted-foreground">{text("Choose a file from this revision.")}</p>:entry.kind==="submodule"?<div className="space-y-2 p-4 text-sm"><p>{text("Submodule commit")}</p><code dir="ltr" className="block break-all">{entry.hash}</code></div>:<Tabs value={tab} onValueChange={setTab} dir={direction} className="min-h-0 min-w-0 flex-1 gap-0">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b p-2"><TabsList><TabsTrigger value="file">{text("File contents")}</TabsTrigger><TabsTrigger value="annotate" disabled={entry.kind!=="file"||blob?.binary===true||blob?.truncated===true}>{text("Annotate this revision")}</TabsTrigger></TabsList><div title={text("File history follows the current HEAD.")}><FileHistory workspaceId={workspaceId} path={path} file={selected}/></div></div>
          <p dir="ltr" className="shrink-0 truncate border-b px-3 py-2 font-mono text-xs text-muted-foreground" title={selected}>{selected}{blob&&` · ${new Intl.NumberFormat(locale).format(blob.size)} B`}</p>
          <TabsContent value="file" className="m-0 min-h-0 min-w-0 flex-1 overflow-auto">
            {blobError?<p role="alert" className="p-4 text-sm text-destructive">{text(blobError)}</p>:!blob?<p role="status" className="p-4 text-sm text-muted-foreground">{text("Loading file…")}</p>:blob.preview?<FileContentPreview key={`${blob.revision}:${blob.path}`} file={blob.preview}/>:blob.truncated?<p className="p-4 text-sm text-muted-foreground">{text("File exceeds the 2 MiB text preview limit.")}</p>:blob.binary?<p className="p-4 text-sm text-muted-foreground">{text("Binary file: text preview is unavailable.")}</p>:<>{blob.kind==="symlink"&&<p className="border-b px-3 py-2 text-xs text-amber-600 dark:text-amber-400">{text("Symbolic link target (not followed)")}</p>}<pre dir="ltr" aria-label={text("File contents")} className="w-max min-w-full p-3 font-mono text-xs leading-5">{blob.text||" "}</pre></>}
          </TabsContent>
          <TabsContent value="annotate" className="m-0 flex min-h-0 min-w-0 flex-1 flex-col"><p className="shrink-0 border-b px-3 py-2 text-xs text-muted-foreground">{text("Annotations refer to this committed snapshot, without local edits.")}</p>{annotationError?<p role="alert" className="p-4 text-sm text-destructive">{text(annotationError)}</p>:!annotations?<p role="status" className="p-4 text-sm text-muted-foreground">{t("Loading annotations…")}</p>:<div role="region" aria-label={text("Annotate this revision")} dir="ltr" className="min-h-0 flex-1 overflow-auto"><table className="w-max min-w-full border-collapse text-xs"><thead className="sticky top-0 bg-muted"><tr>{["Author","Commit","Original line","Line","Source"].map(label=><th key={label} className="border-b px-2 py-2 text-start">{text(label)}</th>)}</tr></thead><tbody>{annotations.lines.map(line=><tr key={line.line} className="border-b border-border/40 hover:bg-muted/40"><td dir="auto" className="whitespace-nowrap px-2 py-0.5">{line.author}</td><td className="px-2 font-mono" title={line.hash}>{line.hash.slice(0,8)}</td><td className="px-2 text-end font-mono text-muted-foreground" title={line.path}>{line.originalLine}</td><td className="px-2 text-end font-mono text-muted-foreground">{line.line}</td><td className="whitespace-pre px-3 font-mono">{line.text||" "}</td></tr>)}</tbody></table>{annotations.truncated&&<p className="p-3 text-xs text-amber-600 dark:text-amber-400">{t("Annotations limited to the first 10,000 lines.")}</p>}</div>}</TabsContent>
        </Tabs>}</div>
      </div>}
    </DialogContent>
  </Dialog>;
}
