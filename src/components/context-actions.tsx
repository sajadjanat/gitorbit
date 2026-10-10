import { useRef, type ReactElement } from "react";
import { ContextMenu } from "radix-ui";
import { MoreHorizontal } from "lucide-react";
import { t, useLanguage } from "@/lib/i18n";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";

export type ContextAction = { label:string; run:()=>void; disabled?:boolean; destructive?:boolean; separator?:boolean };
const itemClass = "relative flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs outline-none select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50";
export function ContextActions({label,actions,children,onOpen}: {label:string;actions:ContextAction[];children:ReactElement;onOpen?:()=>void}) {
  const {direction}=useLanguage();
  const selected=useRef(false);
  return <ContextMenu.Root dir={direction} onOpenChange={open=>{if(open){selected.current=false;onOpen?.();}}}>
    <ContextMenu.Trigger asChild onKeyDown={event=>{
      if(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey){
        event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,button:2}));
      }
    }}>{children}</ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Content aria-label={label} onClick={event=>event.stopPropagation()} onCloseAutoFocus={event=>{if(selected.current)event.preventDefault();}} className="z-[100] min-w-52 max-w-80 max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
      <ContextMenu.Label className="truncate px-2 py-1.5 text-[11px] text-muted-foreground" dir="auto">{label}</ContextMenu.Label>
      {actions.map((action,i)=><div key={i}>{action.separator&&<ContextMenu.Separator className="my-1 h-px bg-border"/>}<ContextMenu.Item disabled={action.disabled} className={`${itemClass} ${action.destructive?"text-destructive focus:text-destructive":""}`} onSelect={event=>{selected.current=true;event.stopPropagation();action.run();}}>{action.label}</ContextMenu.Item></div>)}
    </ContextMenu.Content></ContextMenu.Portal>
  </ContextMenu.Root>;
}
export function ActionMenuButton({label,actions,disabled=false,text}: {label:string;actions:ContextAction[];disabled?:boolean;text?:string}) {
  const {direction}=useLanguage();
  const selected=useRef(false);
  return <DropdownMenu dir={direction} onOpenChange={open=>{if(open)selected.current=false;}}><DropdownMenuTrigger asChild><Button aria-label={text??t("Actions for {name}",{name:label})} size={text?"sm":"icon-sm"} variant="ghost" disabled={disabled} onClick={event=>event.stopPropagation()}>{text??<MoreHorizontal className="size-3.5"/>}</Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-60" onClick={event=>event.stopPropagation()} onCloseAutoFocus={event=>{if(selected.current)event.preventDefault();}}><DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground" dir="auto">{label}</DropdownMenuLabel>{actions.map((action,i)=><div key={i}>{action.separator&&<DropdownMenuSeparator/>}<DropdownMenuItem className="text-xs" disabled={action.disabled} variant={action.destructive?"destructive":"default"} onSelect={event=>{selected.current=true;event.stopPropagation();action.run();}}>{action.label}</DropdownMenuItem></div>)}</DropdownMenuContent>
  </DropdownMenu>;
}
