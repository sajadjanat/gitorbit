import {useEffect,useRef,useState} from "react";
import {ChevronLeft,ChevronRight} from "lucide-react";
import {Button} from "./ui/button";
import {number,t} from "@/lib/i18n";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export default function PdfPreview({dataUrl}:{dataUrl:string}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [document,setDocument]=useState<import("pdfjs-dist").PDFDocumentProxy|null>(null);
  const [page,setPage]=useState(1);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;let task:import("pdfjs-dist").PDFDocumentLoadingTask|undefined;
    setDocument(null);setPage(1);setError("");setLoading(true);
    void import("pdfjs-dist/legacy/build/pdf.mjs").then(async pdf=>{
      if(cancelled)return;
      pdf.GlobalWorkerOptions.workerSrc=workerUrl;
      const bytes=Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",")+1)),char=>char.charCodeAt(0));
      task=pdf.getDocument({data:bytes,cMapUrl:"/pdfjs/cmaps/",cMapPacked:true,standardFontDataUrl:"/pdfjs/standard_fonts/",wasmUrl:"/pdfjs/wasm/",iccUrl:"/pdfjs/iccs/",useSystemFonts:true});
      task.onPassword=()=>{if(!cancelled){setError("This PDF requires a password.");setLoading(false);}void task?.destroy().catch(()=>{});};
      const result=await task.promise;
      if(cancelled){await task.destroy();return;}
      setDocument(result);
    }).catch(()=>{if(!cancelled){setError(old=>old||"This PDF could not be displayed.");setLoading(false);}});
    return()=>{cancelled=true;void task?.destroy().catch(()=>{});};
  },[dataUrl]);
  useEffect(()=>{
    if(!document)return;
    let cancelled=false;let render:import("pdfjs-dist").RenderTask|undefined;
    setLoading(true);setError("");
    void document.getPage(page).then(async pdfPage=>{
      if(cancelled||!canvas.current)return;
      const viewport=pdfPage.getViewport({scale:1});
      // Bound the canvas independently of PDF page dimensions.
      const scale=Math.min(2,1600/Math.max(viewport.width,viewport.height));
      const sized=pdfPage.getViewport({scale});
      const target=canvas.current;target.width=Math.ceil(sized.width);target.height=Math.ceil(sized.height);
      render=pdfPage.render({canvas:target,viewport:sized});
      await render.promise;
      if(!cancelled)setLoading(false);
    }).catch(()=>{if(!cancelled){setError("This PDF page could not be displayed.");setLoading(false);}});
    return()=>{cancelled=true;render?.cancel();};
  },[document,page]);
  return <div className="flex w-full min-w-0 flex-col items-center gap-3 p-3">
    {document&&<div className="sticky top-0 z-10 flex items-center gap-2 rounded-md border bg-background p-1 shadow-sm" dir="ltr">
      <Button size="icon-sm" variant="ghost" aria-label={t("Previous page")} disabled={page===1} onClick={()=>setPage(n=>n-1)}><ChevronLeft className="size-4"/></Button>
      <span dir="auto" className="px-2 text-xs">{t("Page {page} of {total}",{page:number(page),total:number(document.numPages)})}</span>
      <Button size="icon-sm" variant="ghost" aria-label={t("Next page")} disabled={page===document.numPages} onClick={()=>setPage(n=>n+1)}><ChevronRight className="size-4"/></Button>
    </div>}
    {loading&&<p role="status" className="text-xs text-muted-foreground">{t("Loading preview…")}</p>}
    {error&&<p role="alert" className="p-3 text-sm text-muted-foreground">{t(error)}</p>}
    <canvas ref={canvas} hidden={Boolean(error)||!document} aria-label={t("PDF page preview")} className="h-auto max-w-full bg-white shadow-sm"/>
  </div>;
}
