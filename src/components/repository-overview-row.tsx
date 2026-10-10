import { GitBranch } from "lucide-react";
import { t, number } from "@/lib/i18n";
import { nextStep, type Repository } from "@/lib/native";
import { Badge } from "./ui/badge";
import { TableCell, TableRow } from "./ui/table";
import { ContextActions, ActionMenuButton, type ContextAction } from "./context-actions";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const colors={red:"text-red-700 dark:text-red-400 bg-red-500/10 border-red-500/20",amber:"text-amber-800 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",blue:"text-blue-700 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",green:"text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",neutral:"text-muted-foreground bg-muted/30 border-border"};
export function RepositoryOverviewRow({repo:r,stale=false,actions,onOpen}:{repo:Repository;stale?:boolean;actions:ContextAction[];onOpen:()=>void}) {
  const step=nextStep(r);const unavailable=Boolean(r.error)||stale;
  const remoteTitle=t("Commit counts use the last fetch. Fetch remotes to update them.");
  return <ContextActions label={r.name} actions={actions}><TableRow data-testid="repository-overview-row" className="group cursor-pointer hover:bg-muted/40" onClick={onOpen}>
    <TableCell className="ps-4 py-3"><button type="button" className="max-w-full rounded-sm text-start font-medium focus-visible:outline-ring hover:underline underline-offset-4" onClick={e=>{e.stopPropagation();onOpen();}}><bdi>{r.name}</bdi></button><span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><GitBranch className="size-3 shrink-0"/><bdi className="truncate">{r.detached?t("Detached HEAD"):r.branch}</bdi></span></TableCell>
    <TableCell className="text-end tabular-nums">
      {unavailable?<span className="text-muted-foreground" title={t("Status unavailable")}>—</span>:<Tooltip><TooltipTrigger asChild><span tabIndex={0} className="inline-flex flex-col items-end gap-0.5 rounded-sm focus-visible:outline-ring" aria-label={t("{count} changed files",{count:r.changed})}><span className={r.changed?"font-medium text-amber-800 dark:text-amber-400":"text-muted-foreground"}>{number(r.changed)}</span>{r.staged>0&&<span className="text-[10px] text-muted-foreground">{t("{count} staged",{count:r.staged})}</span>}</span></TooltipTrigger><TooltipContent className="max-w-64 space-y-1"><p>{t("{count} changed files",{count:r.changed})}</p><p>{t("{staged} staged · {unstaged} unstaged · {untracked} new",{staged:r.staged,unstaged:r.unstaged,untracked:r.untracked})}</p><p>{t("Each file counts once, even when it has staged and unstaged changes.")}</p></TooltipContent></Tooltip>}
    </TableCell>
    {!r.upstream&&!unavailable?<TableCell colSpan={2} className="text-center text-xs text-muted-foreground">{t("No upstream")}</TableCell>:<>{([r.ahead,r.behind] as const).map((count,i)=><TableCell key={i} className={`text-end tabular-nums ${count&&!unavailable?"font-medium text-blue-700 dark:text-blue-400":"text-muted-foreground"}`} title={unavailable?t("Status unavailable"):remoteTitle} aria-label={unavailable?t("Status unavailable"):count===null?t("Remote count unavailable"):t(i===0?"{count} commits to push":"{count} commits to pull",{count})}>{unavailable?"—":count===null?t("Unknown"):number(count)}</TableCell>)}</>}
    <TableCell className="ps-5"><button type="button" aria-label={t("Details for {name}",{name:r.name})} onClick={e=>{e.stopPropagation();onOpen();}}><Badge variant="outline" className={`rounded-md px-2 py-0.5 font-normal ${colors[unavailable?"red":step.tone]}`}>{unavailable?t("Check status"):t(step.label)}</Badge></button></TableCell>
    <TableCell className="text-end pe-3"><ActionMenuButton label={r.name} actions={actions}/></TableCell>
  </TableRow></ContextActions>;
}
