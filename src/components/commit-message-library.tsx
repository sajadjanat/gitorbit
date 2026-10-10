import { useEffect, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Template = {name: string; message: string};
type Library = {history: string[]; templates: Template[]};
function key(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return "gitorbit-commit-messages:" + encodeURIComponent(/^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized);
}
export function readCommitMessages(path: string): Library {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(path)) ?? "null");
    if (!value || typeof value !== "object") return {history:[],templates:[]};
    const data = value as Partial<Library>;
    return {
      history: Array.isArray(data.history) ? data.history.filter((message): message is string => typeof message === "string" && message.length <= 16384).slice(0,20) : [],
      templates: Array.isArray(data.templates) ? data.templates.filter((item): item is Template => !!item && typeof item.name === "string" && item.name.length <= 80 && typeof item.message === "string" && item.message.length <= 16384).slice(0,20) : [],
    };
  } catch {return {history:[],templates:[]};}
}
function write(path: string, library: Library) {
  try {localStorage.setItem(key(path), JSON.stringify(library));return null;}
  catch {return "Could not save commit messages on this device.";}
}
export function rememberCommitMessage(path: string, message: string): string | null {
  if (!message.trim() || message.length > 16384) return null;
  const library = readCommitMessages(path);
  library.history = [message, ...library.history.filter((previous) => previous !== message)].slice(0,20);
  return write(path, library);
}
export function CommitMessageLibrary({path, message, blocked, onUse}: {path:string;message:string;blocked:boolean;onUse:(message:string)=>void}) {
  const [open,setOpen]=useState(false);const [library,setLibrary]=useState<Library>({history:[],templates:[]});
  const [selected,setSelected]=useState<string|null>(null);const [replace,setReplace]=useState(false);const [name,setName]=useState("");const [error,setError]=useState("");
  useEffect(() => {if (open) {setLibrary(readCommitMessages(path));setSelected(null);setReplace(false);setError("");setName("");}},[open,path]);
  const overwrite = !!message.trim() && selected !== message;
  function saveTemplate() {
    const title = name.trim();
    if (!title || title.length > 80 || !message.trim() || message.length > 16384) {setError("Enter a template name and a message of up to 16384 characters.");return;}
    if (library.templates.some((template) => template.name === title)) {setError("A template with this name already exists. Delete it before saving a replacement.");return;}
    if (library.templates.length >= 20) {setError("Delete a template before saving another. You can keep up to 20 templates per repository.");return;}
    const next = {...library,templates:[{name:title,message},...library.templates]};const failure=write(path,next);setError(failure??"");if (!failure) {setLibrary(next);setName("");}
  }
  function remove(kind:"history"|"templates",index:number) {
    const removedMessage = kind === "history" ? library.history[index] : library.templates[index].message;
    const next = kind === "history" ? {...library,history:library.history.filter((_,i)=>i!==index)} : {...library,templates:library.templates.filter((_,i)=>i!==index)};
    const failure=write(path,next);setError(failure??"");if (!failure) {setLibrary(next);if(selected === removedMessage) {setSelected(null);setReplace(false);}}
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" size="sm" className="h-6 px-1 text-[10px]" disabled={blocked}><History className="size-3" />{t("Messages & templates")}</Button></DialogTrigger>
    <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col min-h-0">
      <DialogHeader><DialogTitle>{t("Commit messages & templates")}</DialogTitle><DialogDescription>{t("Saved on this device for this repository. Choosing a message never changes your draft until you apply it.")}</DialogDescription></DialogHeader>
      {error&&<Alert variant="destructive"><AlertDescription>{t(error)}</AlertDescription></Alert>}
      <div className="flex gap-2"><Input aria-label={t("Template name")} placeholder={t("Template name")} value={name} disabled={blocked} onChange={(event)=>setName(event.target.value)} /><Button size="sm" variant="outline" disabled={blocked||!message.trim()} onClick={saveTemplate}>{t("Save draft as template")}</Button></div>
      <div className="flex-1 min-h-0 overflow-auto space-y-3">
        <section><h3 className="text-xs font-medium mb-1">{t("Saved templates")}</h3>{!library.templates.length&&<p className="text-xs text-muted-foreground">{t("No saved templates.")}</p>}{library.templates.map((template,index)=><div key={template.name} className="flex gap-2 items-center rounded border mb-1 px-2 py-1"><button type="button" className="text-start flex-1 min-w-0 truncate text-xs" disabled={blocked} onClick={()=>{setSelected(template.message);setReplace(false);}}>{template.name}</button><Button variant="ghost" size="icon" className="size-6" disabled={blocked} aria-label={t("Delete template {name}",{name:template.name})} onClick={()=>remove("templates",index)}><Trash2 className="size-3" /></Button></div>)}</section>
        <section><h3 className="text-xs font-medium mb-1">{t("Recent commit messages")}</h3>{!library.history.length&&<p className="text-xs text-muted-foreground">{t("No recent commit messages.")}</p>}{library.history.map((saved,index)=><div key={saved} className="flex gap-2 items-center rounded border mb-1 px-2 py-1"><button type="button" className="text-start flex-1 min-w-0 truncate text-xs" disabled={blocked} onClick={()=>{setSelected(saved);setReplace(false);}}>{saved.split("\n")[0]}</button><Button variant="ghost" size="icon" className="size-6" disabled={blocked} aria-label={t("Delete recent message {count}",{count:index+1})} onClick={()=>remove("history",index)}><Trash2 className="size-3" /></Button></div>)}</section>
      </div>
      {selected!==null&&<div className="space-y-2"><pre dir="auto" className="rounded border bg-muted/30 p-2 text-xs whitespace-pre-wrap break-words max-h-40 overflow-auto">{selected}</pre>{overwrite&&<label className="flex items-center gap-2 text-xs"><Checkbox checked={replace} disabled={blocked} onCheckedChange={(value)=>setReplace(value===true)} aria-label={t("Replace my current draft")} />{t("Replace my current draft")}</label>}</div>}
      <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>{t("Close")}</Button><Button disabled={blocked||selected===null||(overwrite&&!replace)} onClick={()=>{if (selected!==null) {onUse(selected);setOpen(false);}}}>{t("Use selected message")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
