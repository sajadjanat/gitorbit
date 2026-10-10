import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, GitBranch, GitMerge, LoaderCircle, Plus, RefreshCw, Search, Star, Undo2, X } from "lucide-react";
import { t, number, useLanguage } from "@/lib/i18n";
import { native, type GitComparison, type GitToolAction, type GitToolRequest, type GitToolsState } from "@/lib/native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SideBySideDiff } from "@/components/side-by-side-diff";
import { RemotesManager } from "@/components/remotes-manager";
import { InteractiveRebase } from "@/components/interactive-rebase";
import { StashDetails } from "@/components/stash-details";
import { TagManager } from "@/components/tag-manager";
import { SubmodulesManager } from "@/components/submodules-manager";
import { Shelves } from "./shelves";
import { ContextActions, ActionMenuButton, type ContextAction } from "./context-actions";

export const toolLabel = (action: GitToolAction): string => ({
  create: t("Create branch"), "restore-branch": t("Restore as branch"), checkout: t("Checkout"), rename: t("Rename branch"), delete: t("Delete branch"),
  merge: t("Merge into current"), rebase: t("Rebase current onto selected"), "cherry-pick": t("Cherry-pick"), revert: t("Revert commit"),
  reset: t("Reset current branch"), "undo-commit": t("Undo last commit"), upstream: t("Set upstream"), "unset-upstream": t("Unset upstream"),
  stash: t("Stash changes"), "stash-apply": t("Apply stash"), "stash-pop": t("Pop stash"), "stash-drop": t("Drop stash"),
  rollback: t("Rollback selected"), "resolve-ours": t("Accept ours"), "resolve-theirs": t("Accept theirs"), "resolve-mark": t("Mark resolved"),
  continue: t("Continue operation"), abort: t("Abort operation"), skip: t("Skip commit"),
  publish: t("Publish branch"), "delete-remote": t("Delete remote branch"), "create-tag": t("Create tag"), "delete-tag": t("Delete tag"), "restore-stash": t("Restore saved stash"), "resolve-edit": t("Edit conflict"),
})[action];

function explanation(action: GitToolAction): string {
  if (action === "delete-remote") return t("Delete the selected branch on its remote server. This affects collaborators. The operation is refused if the remote tip has changed.");
  if (action === "publish") return t("Push this local branch and set its upstream. Existing remote commits are never overwritten by a force push.");
  if (action === "delete-tag") return t("Delete the local tag. A recovery reference keeps its commit available.");
  if (action === "delete") return t("Delete this local branch. A recovery reference keeps its commits available in Recovery.");
  if (action === "merge") return t("Bring the selected branch into the current branch. Divergent history creates a merge commit.");
  if (action === "rebase") return t("Replay current commits on the selected branch. Commit hashes change; avoid rebasing shared commits.");
  if (action === "reset") return t("Soft keeps changes staged. Mixed keeps files and unstages changes. Hard discards committed changes after the selected revision and requires a clean working tree. A recovery reference saves the old HEAD.");
  if (action === "undo-commit") return t("Move the current branch back one commit and keep its changes in the working tree. A recovery reference saves the old HEAD.");
  if (action === "revert") return t("Create a new commit that reverses the selected commit. Existing history is preserved.");
  if (action === "cherry-pick") return t("Apply the selected commit as a new commit on the current branch.");
  if (action === "stash") return t("Save staged, unstaged, and unversioned files in a stash and clean the working tree.");
  if (action === "stash-pop") return t("Restore the stash and remove it only if applying succeeds. Conflicts keep the stash available.");
  if (action === "stash-drop") return t("Remove the stash from the list. A recovery reference preserves it.");
  if (action === "stash-apply") return t("Restore the stash including staged changes, and keep it in the list.");
  if (action === "abort") return t("Cancel the in-progress operation and return to its starting state.");
  if (action === "skip") return t("Skip the conflicting commit and continue the operation.");
  if (action === "create" || action === "restore-branch") return t("Create a local branch from the selected revision. Choose whether to check it out.");
  if (action === "rename") return t("Rename the local branch. Its remote branch name is unchanged.");
  if (action === "checkout") return t("Switch to the selected branch. Git prevents overwriting local changes. Stash changes first if checkout is blocked.");
  return t("Review the selected target and current branch before applying this operation.");
}
export function shortRef(name: string) { return name.replace(/^refs\/(heads|remotes|tags|gitorbit\/recovery)\//, ""); }
function ToolView({active,value,className,children}:{active:string;value:string;className?:string;children:ReactNode}) {
  return active===value?<section className={className}>{children}</section>:null;
}

type Props = { workspaceId: string; path: string; blocked: boolean; onBusyChange: (busy: boolean) => void; onChanged: () => void; initialRevision?: string; initialAction?: GitToolAction };

export function BranchManager(props: Props & { branch?: string; revision?: string; open?:boolean; onOpenChange?:(value:boolean)=>void; hideTrigger?:boolean }) {
  const [localOpen, setLocalOpen] = useState(false);
  const open=props.open??localOpen;const setOpen=(value:boolean)=>{setLocalOpen(value);props.onOpenChange?.(value);};
  const [busy, setBusy] = useState(false);
  const { direction } = useLanguage();
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
    {!props.hideTrigger&&<DialogTrigger asChild><Button size="sm" variant="outline" disabled={props.blocked}>
      <GitBranch className="size-3.5" />{props.revision ? t("Commit actions") : <bdi className="max-w-48 truncate">{props.branch || t("Branches")}</bdi>}<ChevronDown className="size-3" />
    </Button></DialogTrigger>}
    <DialogContent dir={direction} showCloseButton={!busy} className="sm:max-w-5xl h-[82vh] flex flex-col gap-0 p-0 overflow-hidden">
      <DialogHeader className="p-5 pb-3"><DialogTitle>{t("Git branches and operations")}</DialogTitle><DialogDescription className="truncate" dir="ltr">{props.path}</DialogDescription></DialogHeader>
      {open && <GitTools {...props} initialRevision={props.revision} onBusyChange={(value) => { setBusy(value); props.onBusyChange(value); }} />}
    </DialogContent>
  </Dialog>;
}
export function GitTools({ workspaceId, path, blocked, onBusyChange, onChanged, initialRevision, initialAction }: Props) {
  const { direction } = useLanguage();
  const [state, setState] = useState<GitToolsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [remoteExpanded,setRemoteExpanded]=useState(false);
  const remoteGroupId=useId();
  const [shelfOpen,setShelfOpen]=useState(false);
  const [selected, setSelected] = useState("");
  const [revision, setRevision] = useState(initialRevision || "");
  const [tab, setTab] = useState(initialRevision ? "log" : "branches");
  useEffect(()=>{if(state)setSelected(old=>state.refs.some(b=>b.name===old&&(b.kind==="local"||b.kind==="remote"))?old:state.refs.find(b=>b.current)?.name??state.refs.find(b=>b.kind==="local")?.name??"");},[state]);
  const [pending, setPending] = useState<(GitToolRequest & { currentBranch: string; head: string }) | null>(null);
  const [comparison, setComparison] = useState<GitComparison | null>(null);
  const guard = useRef(false);
  const compareGeneration = useRef(0);
  const loadGeneration = useRef(0);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { const value: unknown = JSON.parse(localStorage.getItem(`gitorbit-favorites:${path}`) || "[]"); return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []; } catch { return []; }
  });
  const refresh = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try { const result = await native.tools(workspaceId, path); if (generation === loadGeneration.current) setState(result); }
    catch (e) { if (generation === loadGeneration.current) setError(String(e)); }
    finally { if (generation === loadGeneration.current) setLoading(false); }
  }, [workspaceId, path]);
  useEffect(() => {
    let cancelled = false;
    const generation = ++loadGeneration.current;
    void native.tools(workspaceId, path).then((result) => { if (!cancelled && generation === loadGeneration.current) { setState(result); setLoading(false); } }, (e) => { if (!cancelled && generation === loadGeneration.current) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; compareGeneration.current++; loadGeneration.current++; };
  }, [workspaceId, path]);
  const locked = blocked || busy || loading || !state;
  function prepare(action: GitToolAction, target = "") {
    if (locked || !state) return;
    setError(""); setNotice("");
    const ref = state.refs.find((b) => b.name === target);
    setPending({ action, target, paths: [], name: action === "publish" ? state.remotes[0] || "" : action === "rename" ? shortRef(target) : action === "checkout" && ref?.kind === "remote" ? shortRef(target).split("/").slice(1).join("/") : "", mode: "mixed", force: false, checkout: true, reviewToken: state.reviewToken, currentBranch: state.branch, head: state.head });
  }
  const preparedInitial=useRef(false);
  useEffect(()=>{if(initialAction&&state&&!locked&&!preparedInitial.current){preparedInitial.current=true;prepare(initialAction,initialRevision||"");}},[initialAction,initialRevision,state,locked]);
  function refActions(b:GitToolsState["refs"][number]):ContextAction[] {
    const action=(kind:GitToolAction,disabled=false,destructive=false):ContextAction=>({label:toolLabel(kind),run:()=>prepare(kind,b.name),disabled:locked||disabled,destructive,separator:destructive});
    return [action("checkout",b.current||b.kind==="recovery"||Boolean(state?.operation)),action("create"),{label:t("Compare with current"),disabled:locked||!state?.head,run:()=>{setSelected(b.name);void compare(b.name);}},
      ...(b.kind!=="recovery"?[action("merge",b.current||!!state?.operation),action("rebase",b.current||!!state?.operation)]:[]),
      ...(b.kind==="local"?[action("rename"),action("publish",!state?.remotes.length),...(b.current&&b.upstream?[action("unset-upstream")]:[]),action("delete",b.current,true)]:[]),
      ...(b.kind==="remote"?[action("upstream"),action("delete-remote",false,true)]:[]),
      ...(b.kind==="tag"?[action("delete-tag",false,true)]:[]),...(b.kind==="recovery"?[action("restore-branch"),...(b.name.includes("-stash-")?[action("restore-stash")]:[])]:[]),
    ];
  }
  async function execute() {
    if (!pending || locked || guard.current) return;
    guard.current = true; setBusy(true); onBusyChange(true); setError(""); setNotice("");
    try { const message = await native.toolAction(workspaceId, path, pending); setNotice(message); setPending(null); setComparison(null); setSelected(""); }
    catch (e) { setError(String(e)); setPending(null); }
    finally { await refresh(); onChanged(); guard.current = false; setBusy(false); onBusyChange(false); }
  }
  async function compare(target: string) {
    if (locked) return;
    const generation = ++compareGeneration.current; setError(""); setComparison(null); setBusy(true);
    try { const result = await native.compare(workspaceId, path, target); if (generation === compareGeneration.current) setComparison(result); }
    catch (e) { if (generation === compareGeneration.current) setError(String(e)); }
    finally { if (generation === compareGeneration.current) setBusy(false); }
  }
  function favorite(ref: string) {
    setFavorites((old) => { const next = old.includes(ref) ? old.filter((r) => r !== ref) : [...old, ref]; localStorage.setItem(`gitorbit-favorites:${path}`, JSON.stringify(next)); return next; });
  }
  const branch = state?.refs.find((b) => b.name === selected);
  const refs = [...(state?.refs || [])].filter(b=>(b.kind==="local"||b.kind==="remote")&&shortRef(b.name).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Number(b.current)-Number(a.current)||Number(favorites.includes(b.name))-Number(favorites.includes(a.name))||shortRef(a.name).localeCompare(shortRef(b.name)));
  const named = pending && (["create", "restore-branch", "rename", "stash", "create-tag"].includes(pending.action) || pending.action === "checkout" && state?.refs.find((b) => b.name === pending.target)?.kind === "remote");
  const needsName = named && pending?.action !== "stash";
  const needsClean = !!pending && ["merge", "rebase", "cherry-pick", "revert", "stash-apply", "stash-pop", "restore-stash"].includes(pending.action) && !!state?.changed;
  const actionButton = (action: GitToolAction, target: string, disabled = false) => <Button key={action} variant="outline" size="sm" disabled={locked || disabled} onClick={() => prepare(action, target)}>{toolLabel(action)}</Button>;
  return <div className="relative flex flex-1 min-h-0 flex-col text-xs" data-testid="git-tools">
    <div className="px-4 py-3 border-b flex flex-wrap gap-2 items-center">
      {tab!=="branches"?<Button size="sm" variant="ghost" onClick={()=>{setTab("branches");setComparison(null);}}><ChevronDown className={`size-3.5 ${direction==="rtl"?"-rotate-90":"rotate-90"}`}/>{t("Branches")}</Button>:<span className="flex items-center gap-2 text-muted-foreground"><GitBranch className="size-3.5"/>{t("Current branch")}<bdi className="font-medium text-foreground">{state?.branch||"—"}</bdi></span>}
      {(tab==="stash"||tab==="log")&&<h3 className="font-medium">{t(({stash:"Stashes",tags:"Tags",remotes:"Remotes",submodules:"Submodules",log:"Recovery and history"} as Record<string,string>)[tab])}</h3>}
      <div className="ms-auto flex items-center gap-2">
        {tab==="branches"&&<Button size="sm" variant={branch?.current&&Boolean(branch.upstream)?"default":"outline"} disabled={locked} onClick={()=>prepare("create")}><Plus className="size-3.5"/>{t("Create branch")}</Button>}
        <DropdownMenu dir={direction}><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" disabled={busy||blocked}>{t("Repository tools")}<ChevronDown className="size-3.5"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={event=>{if(shelfOpen)event.preventDefault();}}>
          <DropdownMenuLabel>{t("Saved work")}</DropdownMenuLabel><DropdownMenuItem onSelect={()=>setShelfOpen(true)}>{t("Shelf")}</DropdownMenuItem><DropdownMenuItem onSelect={()=>{setTab("stash");setComparison(null);}}>{t("Stashes")}</DropdownMenuItem>
          <DropdownMenuSeparator/>{(["tags","remotes","submodules"] as const).map(value=><DropdownMenuItem key={value} onSelect={()=>{setTab(value);setComparison(null);}}>{t({tags:"Tags",remotes:"Remotes",submodules:"Submodules"}[value])}</DropdownMenuItem>)}
          <DropdownMenuSeparator/><DropdownMenuItem onSelect={()=>{setTab("log");setComparison(null);}}>{t("Recovery and history")}</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
        {(tab==="branches"||tab==="stash"||tab==="log")&&<Button variant="ghost" size="icon-sm" aria-label={t("Refresh branches")} title={t("Refresh branches")} disabled={busy||blocked||loading} onClick={()=>{setError("");setPending(null);void refresh();}}>{loading||busy?<LoaderCircle className="size-3.5 animate-spin"/>:<RefreshCw className="size-3.5"/>}</Button>}
      </div>
    </div>
    {state?.operation && <div className="px-4 py-3 border-b bg-amber-500/10 space-y-2"><p>{t("Operation in progress: {operation}", { operation: state.operation })} · {t("Conflicts")}: {number(state.conflicts)}</p><div className="flex flex-wrap gap-2">{actionButton("continue", "", state.conflicts > 0)}{actionButton("abort", "")}{state.operation !== "merge" && actionButton("skip", "")}<span className="text-muted-foreground self-center">{t("Resolve files in Version Control, then continue here.")}</span></div></div>}
    {(error || notice) && <Alert role={error ? "alert" : "status"} variant={error ? "destructive" : "default"} className="mx-4 my-2 w-auto py-2"><AlertDescription className="whitespace-pre-wrap break-words">{t(error || notice)}</AlertDescription></Alert>}
    <div className="flex flex-1 min-h-0 flex-col">
      <ToolView active={tab} value="remotes" className="m-0 flex-1 min-h-0 flex flex-col"><RemotesManager workspaceId={workspaceId} path={path} blocked={locked} onBusyChange={onBusyChange} onChanged={() => {void refresh(); onChanged();}} /></ToolView>
      <ToolView active={tab} value="submodules" className="m-0 flex-1 min-h-0 flex flex-col"><SubmodulesManager workspaceId={workspaceId} path={path} blocked={locked} onBusyChange={onBusyChange} onChanged={() => {void refresh(); onChanged();}} /></ToolView>
      <ToolView active={tab} value="tags" className="m-0 flex-1 min-h-0 flex flex-col"><TagManager workspaceId={workspaceId} path={path} onCreateBranch={name=>prepare("create",`refs/tags/${name}`)} onDeleteLocal={name=>prepare("delete-tag",`refs/tags/${name}`)} blocked={locked} onBusyChange={onBusyChange} onChanged={() => {void refresh(); onChanged();}} /></ToolView>
      <ToolView active={tab} value="branches" className="m-0 flex flex-1 min-h-0 flex-col sm:flex-row border-t">
        <div className="sm:w-72 border-e flex flex-col min-h-0 max-h-[45%] sm:max-h-none">
          <div className="p-3"><div className="relative"><Search className="size-3.5 absolute start-2.5 top-2.5 text-muted-foreground"/><Input aria-label={t("Search branches")} placeholder={t("Search branches")} value={query} onChange={e=>setQuery(e.target.value)} className="ps-8 h-8 text-xs"/></div></div>
          <div className="overflow-auto flex-1 px-2 pb-2">{(["local","remote"] as const).map(kind=>{
            const entries=refs.filter(b=>b.kind===kind);if(!entries.length)return null;const expanded=kind==="local"||remoteExpanded||Boolean(query.trim());
            return <section key={kind}>
              {kind==="remote"?<button className="flex w-full items-center gap-2 px-2 py-2 text-muted-foreground focus-visible:outline-ring rounded" aria-expanded={expanded} aria-controls={remoteGroupId} onClick={()=>setRemoteExpanded(value=>!value)}><ChevronDown className={`size-3 ${expanded?"":"-rotate-90 rtl:rotate-90"}`}/>{t("Remote branches")}<span className="ms-auto tabular-nums">{number(entries.length)}</span></button>:<p className="flex px-2 py-2 text-muted-foreground">{t("Local branches")}<span className="ms-auto tabular-nums">{number(entries.length)}</span></p>}
              <div id={kind==="remote"?remoteGroupId:undefined} hidden={!expanded}>{entries.map(b=><ContextActions key={b.name} label={shortRef(b.name)} actions={refActions(b)} onOpen={()=>{setSelected(b.name);setComparison(null);}}><div className={`flex items-center rounded-md ${selected===b.name?"bg-accent":"hover:bg-muted/60"}`}>
                <button type="button" aria-label={t("Favorite {branch}",{branch:shortRef(b.name)})} aria-pressed={favorites.includes(b.name)} className="p-2 rounded focus-visible:outline-2 focus-visible:outline-ring" onClick={()=>favorite(b.name)}><Star className={`size-3 ${favorites.includes(b.name)?"fill-amber-500 text-amber-500":"text-muted-foreground"}`}/></button>
                <button type="button" disabled={busy} aria-pressed={selected===b.name} className="py-2 pe-2 flex gap-2 items-center min-w-0 flex-1 text-start focus-visible:outline-2 focus-visible:outline-ring rounded" onClick={()=>{setSelected(b.name);setComparison(null);}} title={shortRef(b.name)}><bdi dir="ltr" className="truncate flex-1">{shortRef(b.name)}</bdi>{b.current&&<Check className="size-3 text-emerald-700 dark:text-emerald-400"/>}</button>
                <ActionMenuButton label={shortRef(b.name)} actions={refActions(b)} disabled={locked}/>
              </div></ContextActions>)}</div>
            </section>;
          })}{!refs.length&&<p className="p-3 text-muted-foreground">{loading?t("Loading…"):t("No branches match your search.")}</p>}</div>
        </div>
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {branch?<div className="p-5 space-y-4 border-b">
            <div className="flex items-center gap-2 min-w-0"><GitBranch className="size-4 shrink-0 text-muted-foreground"/><h3 className="text-sm font-medium break-all" dir="ltr">{shortRef(branch.name)}</h3>{branch.current&&<span className="text-[11px] text-muted-foreground">{t("Current")}</span>}</div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground"><span>{t(branch.kind==="remote"?"Remote branch":"Local branch")}</span><code dir="ltr" title={branch.hash}>{branch.hash.slice(0,7)}</code>{branch.kind==="local"&&<span>{branch.upstream?<>{t("Upstream")}: <bdi dir="ltr">{shortRef(branch.upstream)}</bdi></>:t("No upstream")}</span>}</div>
            <p className="text-muted-foreground">{branch.current?t("You are working on this branch."):t("Switch to this branch, or compare it with {branch}.",{branch:state?.branch||"HEAD"})}</p>
            <div className="flex flex-wrap gap-2">
              {!branch.current&&<Button size="sm" disabled={locked||Boolean(state?.operation)} onClick={()=>prepare("checkout",branch.name)}>{toolLabel("checkout")}</Button>}
              {branch.current&&!branch.upstream&&<Button size="sm" disabled={locked||!state?.remotes.length} onClick={()=>prepare("publish",branch.name)}>{toolLabel("publish")}</Button>}
              {!branch.current&&<><Button size="sm" variant="outline" disabled={locked||!state?.head} onClick={()=>void compare(branch.name)}>{t("Compare with current")}</Button>{actionButton("merge",branch.name,Boolean(state?.operation))}</>}
              <ActionMenuButton label={shortRef(branch.name)} actions={refActions(branch).filter(action=>![toolLabel("checkout"),t("Compare with current"),toolLabel("merge")].includes(action.label))} disabled={locked} text={t("More actions")}/>
            </div>
          </div>:<div className="flex-1 grid place-items-center p-5 text-center text-muted-foreground"><div><GitMerge className="size-6 mx-auto mb-3"/><p>{t("Select a branch to view its actions.")}</p></div></div>}
          {comparison && <div className="flex-1 min-h-0 flex flex-col"><div className="flex items-center gap-2 p-3 border-b text-muted-foreground"><span className="min-w-0 flex-1">{t("Current-only commits: {ahead} · Selected-only commits: {behind}", {ahead: number(comparison.ahead), behind: number(comparison.behind)})}</span><Button size="icon-sm" variant="ghost" aria-label={t("Close comparison")} title={t("Close comparison")} onClick={()=>setComparison(null)}><X className="size-3.5"/></Button></div>{comparison.diff ? <SideBySideDiff text={comparison.diff} staged={false} revisions={{before: "HEAD", after: shortRef(selected)}} truncated={comparison.truncated} /> : <p className="p-4 text-muted-foreground">{t("No text difference in this view.")}</p>}</div>}
        </div>
      </ToolView>
      <ToolView active={tab} value="stash" className="m-0 flex-1 min-h-0 overflow-auto border-t p-4 space-y-3">
        <div className="flex items-center justify-between gap-3"><p className="text-muted-foreground">{t("Save local work before switching or integrating branches.")}</p>{actionButton("stash", "", !state?.changed || !!state?.operation)}</div>
        {!state?.stashes.length && <p className="p-8 text-center text-muted-foreground">{t("No stashes yet.")}</p>}
        {state?.stashes.map((s) => <div key={s.hash} className="border rounded-lg p-3 space-y-2"><p className="font-medium break-words" dir="auto">{s.subject}</p><code dir="ltr" className="text-muted-foreground">{s.id} · {s.hash.slice(0,7)}</code><div className="flex flex-wrap gap-2"><StashDetails workspaceId={workspaceId} path={path} stashHash={s.hash} blocked={locked} onBusyChange={onBusyChange} onChanged={() => {void refresh(); onChanged();}} />{actionButton("stash-apply", s.hash)}{actionButton("stash-pop", s.hash)}{actionButton("stash-drop", s.hash)}</div></div>)}
      </ToolView>
      <ToolView active={tab} value="log" className="m-0 flex flex-1 min-h-0 flex-col border-t">
        {!!state?.refs.some(ref=>ref.kind==="recovery")&&<div className="p-3 border-b space-y-1"><p className="text-muted-foreground px-1 pb-1">{t("Recovery")}</p>{state.refs.filter(ref=>ref.kind==="recovery").map(ref=><ContextActions key={ref.name} label={shortRef(ref.name)} actions={refActions(ref)}><div className="flex items-center gap-2 rounded px-2 hover:bg-muted"><code dir="ltr" className="min-w-0 flex-1 truncate">{shortRef(ref.name)}</code><ActionMenuButton label={shortRef(ref.name)} actions={refActions(ref)} disabled={locked}/></div></ContextActions>)}</div>}
        <div className="p-3 border-b"><InteractiveRebase workspaceId={workspaceId} path={path} blocked={locked} onBusyChange={onBusyChange} onChanged={() => {void refresh(); onChanged();}} /></div>
        <div className="p-4 border-b space-y-3"><div className="flex flex-wrap gap-2"><Undo2 className="size-4 text-muted-foreground self-center" />{actionButton("undo-commit", "", !state?.head || !!state?.operation)}</div>
          <label htmlFor="git-revision" className="block font-medium">{t("Commit or revision")}</label><Input id="git-revision" dir="ltr" value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="HEAD~1" />
          <div className="flex flex-wrap gap-2">{(["create", "create-tag", "cherry-pick", "revert", "reset"] as const).map((a) => actionButton(a, revision, !revision.trim() || !!state?.operation))}</div><p className="text-muted-foreground">{t("Select a reflog entry to recover previous work or act on its commit.")}</p>
        </div>
        <div className="flex-1 overflow-auto divide-y">{state?.reflog.map((entry) => <button type="button" key={entry.id} className={`w-full px-4 py-3 text-start flex gap-3 items-center hover:bg-muted/50 ${revision === entry.hash ? "bg-accent" : ""}`} onClick={() => setRevision(entry.hash)}><code dir="ltr" className="text-muted-foreground shrink-0">{entry.hash.slice(0,7)}</code><span dir="auto" className="truncate">{entry.subject}</span><code dir="ltr" className="ms-auto text-muted-foreground shrink-0">{entry.id}</code></button>)}</div>
      </ToolView>
    </div>
    <Shelves workspaceId={workspaceId} path={path} open={shelfOpen} onOpenChange={setShelfOpen} hideTrigger blocked={locked} onBusyChange={onBusyChange} onChanged={()=>{void refresh();onChanged();}}/>
    {pending && <Dialog open onOpenChange={(value) => { if (!value && !busy) setPending(null); }}><DialogContent dir={direction} showCloseButton={!busy} className="sm:max-w-xl max-h-[85vh] overflow-auto">
      <DialogHeader><DialogTitle>{toolLabel(pending.action)}</DialogTitle><DialogDescription>{explanation(pending.action)}</DialogDescription></DialogHeader>
      <dl className="mt-5 border rounded-lg p-3 space-y-2"><div className="flex gap-3"><dt className="text-muted-foreground">{t("Current branch")}</dt><dd><bdi>{pending.currentBranch}</bdi> <code dir="ltr">{pending.head.slice(0,7)}</code></dd></div>{pending.target && <div className="flex gap-3"><dt className="text-muted-foreground">{t("Selected target")}</dt><dd dir="ltr" className="break-all font-mono">{shortRef(pending.target)}</dd></div>}</dl>
      {named && <div className="mt-4 space-y-2"><label htmlFor="git-action-name">{pending.action === "stash" ? t("Stash message") : pending.action === "create-tag" ? t("Tag name") : t("Branch name")}</label><Input id="git-action-name" dir={pending.action === "stash" ? "auto" : "ltr"} value={pending.name} disabled={busy} onChange={(e) => setPending({...pending, name: e.target.value})} maxLength={255} autoFocus /></div>}
      {pending.action === "publish" && <div className="space-y-2"><label>{t("Remote")}</label><Select value={pending.name} disabled={busy} onValueChange={(name) => setPending({...pending, name})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{state?.remotes.map((remote) => <SelectItem key={remote} value={remote}>{remote}</SelectItem>)}</SelectContent></Select></div>}
      {(pending.action === "create" || pending.action === "restore-branch") && <label className="mt-4 flex gap-2 items-center"><Checkbox checked={pending.checkout} disabled={busy} onCheckedChange={(v) => setPending({...pending, checkout: v === true})} />{t("Checkout new branch")}</label>}
      {pending.action === "delete" && <label className="mt-4 flex gap-2 items-center"><Checkbox checked={pending.force} disabled={busy} onCheckedChange={(v) => setPending({...pending, force: v === true})} />{t("Also delete if commits are not merged")}</label>}
      {pending.action === "checkout" && <label className="mt-4 flex gap-2 items-center"><Checkbox checked={pending.mode === "smart"} disabled={busy} onCheckedChange={(v) => setPending({...pending, mode: v === true ? "smart" : "mixed"})} />{t("Smart checkout · stash local changes and restore them after switching")}</label>}
      {pending.action === "reset" && <div className="mt-4 space-y-2"><label>{t("Reset mode")}</label><Select value={pending.mode} onValueChange={(mode) => setPending({...pending, mode})} disabled={busy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="soft">{t("Soft · keep staged changes")}</SelectItem><SelectItem value="mixed">{t("Mixed · keep files, unstage changes")}</SelectItem><SelectItem value="hard">{t("Hard · discard committed changes")}</SelectItem></SelectContent></Select></div>}
      {(needsClean || pending.action === "reset" && pending.mode === "hard" && !!state?.changed) && <Alert><AlertDescription>{t("Commit or stash local changes before this operation.")}</AlertDescription></Alert>}
      <div className="mt-6 flex gap-2 justify-end"><Button variant="outline" disabled={busy} onClick={() => setPending(null)}>{t("Cancel")}</Button><Button disabled={locked || needsClean || pending.action === "reset" && pending.mode === "hard" && !!state?.changed || !!needsName && !pending.name.trim()} onClick={() => void execute()}>{busy && <LoaderCircle className="size-4 animate-spin" />}{toolLabel(pending.action)}</Button></div>
    </DialogContent></Dialog>}
  </div>;
}
