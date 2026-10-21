import { useId, useRef, useState } from "react";
import { FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { number, t, useLanguage } from "@/lib/i18n";
import type { Workspace } from "@/lib/native";

export function WorkspaceTabs({ workspaces, counts, disabled, onClose, onReorder }: {
  workspaces: Workspace[]; counts: Record<string, number>; disabled: boolean;
  onClose: (id: string) => void; onReorder: (next: Workspace[]) => Promise<boolean>;
}) {
  const { direction } = useLanguage();
  const helpId = useId();
  const source = useRef<{id:string;x:number;y:number;target:string|null;moving:boolean} | null>(null);
  const suppressClick = useRef(false);
  const pending = useRef(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  function reset() { source.current = null; setDragged(null); setOver(null); }
  async function move(id: string, destination: string) {
    if (disabled || pending.current || id === destination) return;
    const from = workspaces.findIndex(w => w.id === id);
    const to = workspaces.findIndex(w => w.id === destination);
    if (from < 0 || to < 0) return;
    const next = [...workspaces];
    next.splice(to, 0, next.splice(from, 1)[0]);
    pending.current = true;
    try {
      if (await onReorder(next)) setAnnouncement(t("Moved {name} to position {position} of {total}", {name: next[to].name, position: to + 1, total: next.length}));
    } finally { pending.current = false; }
  }
  return <div className="border-b overflow-x-auto overflow-y-hidden px-4 sm:px-6">
    <p id={helpId} className="sr-only">{t("Drag tabs to reorder, or use Alt+Shift+Arrow keys.")}</p>
    <span role="status" className="sr-only">{announcement}</span>
    <TabsList variant="line" aria-label={t("Workspaces")} className="h-12 gap-1 justify-start">
      {workspaces.map((w, index) => {
        const marker = over === w.id && dragged !== w.id;
        const after = workspaces.findIndex(item => item.id === dragged) < index;
        return <div key={w.id} data-workspace-tab={w.id}
          className={`relative flex items-center h-full shrink-0 touch-none select-none ${dragged === w.id ? "opacity-50" : ""}`}
          onDragStart={event => event.preventDefault()}
          onPointerDown={event => {
            if (disabled || pending.current || event.button !== 0 || workspaces.length < 2 || (event.target as HTMLElement).closest("[data-tab-close]")) return;
            suppressClick.current = false;
            source.current = {id:w.id,x:event.clientX,y:event.clientY,target:null,moving:false};
          }}
          onPointerMove={event => {
            const drag=source.current;
            if (!drag || disabled || pending.current) return;
            if (event.buttons === 0) {reset(); return;}
            if (!drag.moving && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6) return;
            if (!drag.moving) {drag.moving=true; event.currentTarget.setPointerCapture(event.pointerId); setDragged(drag.id);}
            event.preventDefault();
            const hit=event.currentTarget.ownerDocument.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>("[data-workspace-tab]");
            drag.target=hit?.parentElement===event.currentTarget.parentElement ? hit?.dataset.workspaceTab ?? null : null;
            setOver(drag.target);
          }}
          onPointerUp={event => {
            const drag=source.current;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            reset();
            if (drag?.moving) {suppressClick.current=true; if(drag.target) void move(drag.id,drag.target);}
          }}
          onPointerCancel={reset}
          onLostPointerCapture={reset}
          onKeyDownCapture={event => {if(event.key==="Escape") reset();}}
          onClickCapture={event => {if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}>
          {marker && <span aria-hidden="true" className={`absolute inset-y-2 w-0.5 rounded bg-primary ${after ? "end-0" : "start-0"}`}/>}
          <TabsTrigger value={w.id} title={`${w.path}\n${t("Drag tabs to reorder, or use Alt+Shift+Arrow keys.")}`} aria-describedby={helpId}
            className={`h-full rounded-none px-3 gap-2 ${disabled ? "" : "cursor-grab active:cursor-grabbing"}`}
            onKeyDown={event => {
              if (!event.altKey || !event.shiftKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
              event.preventDefault(); event.stopPropagation();
              const delta = (event.key === "ArrowRight" ? 1 : -1) * (direction === "rtl" ? -1 : 1);
              const target = workspaces[index + delta]; if (target) void move(w.id, target.id);
            }}>
            <FolderOpen className="size-3.5"/><bdi className="max-w-48 truncate">{w.name}</bdi>
            {Boolean(counts[w.id]) && <span title={t("Repositories needing attention")} className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-400 tabular-nums">{number(counts[w.id])}</span>}
          </TabsTrigger>
          <Button variant="ghost" size="icon-sm" aria-label={t("Close {name}", {name:w.name})} title={t("Close {name}", {name:w.name})}
            data-tab-close disabled={disabled} onClick={() => onClose(w.id)}><X className="size-3"/></Button>
        </div>;
      })}
    </TabsList>
  </div>;
}
