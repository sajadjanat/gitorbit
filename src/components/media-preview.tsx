import {lazy,Suspense,useEffect,useRef,useState} from "react";
import {Minus,Plus,Scan} from "lucide-react";
import {type FilePreview,type MediaDiff} from "@/lib/native";
import {fileType} from "@/lib/file-types";
import {number,t} from "@/lib/i18n";
import {FileIcon} from "./file-icon";
import {Button} from "./ui/button";
const PdfPreview=lazy(()=>import("./pdf-preview"));
export const fileSize=(size:number)=>size<1024?`${number(size)} B`:size<1048576?`${number(Math.round(size/102.4)/10)} KiB`:`${number(Math.round(size/104857.6)/10)} MiB`;
const checkerboard={backgroundImage:"conic-gradient(var(--muted) 25%, transparent 0 50%, var(--muted) 0 75%, transparent 0)",backgroundSize:"20px 20px"};

export function FileContentPreview({file,zoom="fit"}:{file:FilePreview;zoom?:"fit"|number}) {
  const [failed,setFailed]=useState(false);
  const [dimensions,setDimensions]=useState("");
  const [naturalWidth,setNaturalWidth]=useState(0);
  const [height,setHeight]=useState(500);
  const pane=useRef<HTMLDivElement>(null);
  useEffect(()=>{setFailed(false);setDimensions("");setNaturalWidth(0);},[file.dataUrl,file.path,file.unavailable]);
  useEffect(()=>{if(!pane.current)return;const element=pane.current;const observer=new ResizeObserver(()=>{if(element.clientHeight)setHeight(element.clientHeight);});observer.observe(element);return()=>observer.disconnect();},[]);
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
      <FileIcon path={file.path}/><span>{fileType(file.path).label}</span><span>·</span><span>{fileSize(file.size)}</span>{dimensions&&<span dir="ltr">· {dimensions}</span>}
    </div>
    <div ref={pane} className="flex min-h-40 min-w-0 flex-1 overflow-auto" style={file.kind==="image"?checkerboard:undefined}>
      {file.unavailable||failed||!file.dataUrl?<div className="m-auto flex max-w-md flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground"><FileIcon path={file.path} className="size-12"/><p>{t(file.unavailable??(file.kind==="image"?"This image could not be displayed.":"This media format could not be played."))}</p></div>
      :file.kind==="image"?<div className="m-auto shrink-0 p-4" style={{maxWidth:zoom==="fit"?"100%":undefined}}><img src={file.dataUrl} alt={file.path} draggable={false} onError={()=>setFailed(true)} onLoad={e=>{const image=e.currentTarget;setNaturalWidth(image.naturalWidth);setDimensions(`${image.naturalWidth} × ${image.naturalHeight}`);}} style={zoom==="fit"?{maxWidth:"100%",maxHeight:Math.max(100,height-32),objectFit:"contain"}:{width:naturalWidth?naturalWidth*zoom/100:undefined,maxWidth:"none",height:"auto"}} className="block"/></div>
      :file.kind==="pdf"?<Suspense fallback={<p role="status" className="m-auto p-4 text-xs text-muted-foreground">{t("Loading preview…")}</p>}><PdfPreview dataUrl={file.dataUrl}/></Suspense>
      :file.kind==="audio"?<audio controls preload="metadata" src={file.dataUrl} aria-label={t("Audio preview")} onError={()=>setFailed(true)} className="m-auto w-full max-w-md p-4"/>
      :file.kind==="video"?<video controls preload="metadata" src={file.dataUrl} aria-label={t("Video preview")} onError={()=>setFailed(true)} className="m-auto max-h-[65vh] max-w-full p-3"/>
      :<p className="m-auto p-6 text-sm text-muted-foreground">{t("No built-in preview for this file type.")}</p>}
    </div>
  </div>;
}
export function MediaPreview({media,beforeLabel,afterLabel}:{media:MediaDiff;beforeLabel:string;afterLabel:string}) {
  const [zoom,setZoom]=useState<"fit"|number>("fit");
  const images=[media.before,media.after].some(file=>file?.kind==="image"&&file.dataUrl);
  const sides=[{file:media.before,label:beforeLabel},{file:media.after,label:afterLabel}].filter(side=>side.file);
  return <div className="flex h-full min-h-0 min-w-0 flex-col" aria-label={t("File preview")}>
    {images&&<div className="flex shrink-0 items-center justify-end gap-1 border-b px-2 py-1" dir="ltr">
      <Button size="icon-sm" variant="ghost" aria-label={t("Zoom out")} disabled={zoom!=="fit"&&zoom<=25} onClick={()=>setZoom(z=>Math.max(25,(z==="fit"?100:z)-25))}><Minus className="size-3.5"/></Button>
      <span className="min-w-12 text-center text-xs tabular-nums">{zoom==="fit"?t("Fit"):t("{zoom}%",{zoom})}</span>
      <Button size="icon-sm" variant="ghost" aria-label={t("Zoom in")} disabled={zoom!=="fit"&&zoom>=400} onClick={()=>setZoom(z=>Math.min(400,(z==="fit"?100:z)+25))}><Plus className="size-3.5"/></Button>
      <Button size="sm" variant="ghost" aria-label={t("Fit image")} onClick={()=>setZoom("fit")}><Scan className="size-3.5"/>{t("Fit")}</Button>
    </div>}
    <div className={`grid min-h-0 min-w-0 flex-1 overflow-auto ${sides.length===2?"grid-cols-1 md:grid-cols-2":"grid-cols-1"}`} dir="ltr">
      {sides.map((side,index)=><section key={`${index}:${side.file!.path}:${side.file!.dataUrl?.slice(-40)}`} className="flex min-h-72 min-w-0 flex-col border-border first:border-b md:min-h-0 md:first:border-b-0 md:[&:not(:last-child)]:border-r" aria-label={side.label}>
        <div dir="auto" className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{side.label}</div>
        <FileContentPreview file={side.file!} zoom={zoom}/>
      </section>)}
      {sides.length===0&&<p dir="auto" className="m-auto p-6 text-sm text-muted-foreground">{t("No file content in this version.")}</p>}
    </div>
  </div>;
}
