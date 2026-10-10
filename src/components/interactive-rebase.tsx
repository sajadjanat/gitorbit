import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GitBranch, LoaderCircle, RefreshCw } from "lucide-react";
import { native, type InteractiveRebaseRequest, type RebaseInfo } from "@/lib/native";
import { t, number } from "@/lib/i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Step = InteractiveRebaseRequest["steps"][number];
const actions: Step["action"][] = ["pick", "reword", "squash", "fixup", "drop"];
const labels = {pick: "Keep commit", reword: "Edit message", squash: "Squash into previous", fixup: "Fixup into previous", drop: "Drop commit"};
export function InteractiveRebase({workspaceId, path, blocked, onBusyChange, onChanged}: {workspaceId: string; path: string; blocked: boolean; onBusyChange?: (busy: boolean) => void; onChanged: () => void}) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState("");
  const [info, setInfo] = useState<RebaseInfo | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const loadGeneration = useRef(0);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const generation = ++loadGeneration.current;
    setLoading(true); setInfo(null); setSteps([]); setError(""); setPublished(false);
    void native.interactiveRebase(workspaceId, path, "").then((value) => {
      if (cancelled || generation !== loadGeneration.current) return;
      setInfo(value); setBase(value.base); setSteps(value.commits.map((commit) => ({hash: commit.hash, action: "pick", message: commit.message})));
    }, (e) => {if (!cancelled && generation === loadGeneration.current) setError(String(e));}).finally(() => {if (!cancelled && generation === loadGeneration.current) setLoading(false);});
    return () => {cancelled = true;loadGeneration.current++;};
  }, [open, workspaceId, path]);
  async function load() {
    if (loading || busy) return;
    const generation = ++loadGeneration.current;
    setLoading(true); setInfo(null); setSteps([]); setError(""); setPublished(false);
    try {
      const value = await native.interactiveRebase(workspaceId, path, base);
      if (generation !== loadGeneration.current) return;
      setInfo(value); setBase(value.base); setSteps(value.commits.map((commit) => ({hash: commit.hash, action: "pick", message: commit.message})));
    } catch (e) {if (generation === loadGeneration.current) setError(String(e));}
    finally {if (generation === loadGeneration.current) setLoading(false);}
  }
  function patch(hash: string, change: Partial<Step>) {setSteps((old) => old.map((step) => step.hash === hash ? {...step, ...change} : step));}
  function move(index: number, direction: number) {setSteps((old) => {const next = [...old]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next;});}
  const firstKept = steps.find((step) => step.action !== "drop");
  const invalid = !firstKept || ["squash", "fixup"].includes(firstKept.action) || steps.some((step) => ["reword", "squash"].includes(step.action) && !step.message.trim());
  async function start() {
    if (!info || busy || loading || blocked || info.blockedReason || invalid || (info.published && !published)) return;
    const request: InteractiveRebaseRequest = {reviewToken: info.reviewToken, base: info.base, steps: steps.map((step) => ({...step})), allowPublished: published};
    setBusy(true); onBusyChange?.(true); setError(""); setNotice("");
    try {setNotice(await native.startInteractiveRebase(workspaceId, path, request)); setOpen(false);}
    catch (e) {setError(String(e)); setInfo(null);}
    finally {setBusy(false); onBusyChange?.(false); onChanged();}
  }
  return <>
    {notice && <p role="status" className="text-xs text-muted-foreground">{t(notice)}</p>}
    <Dialog open={open} onOpenChange={(value) => {if (!busy) {setOpen(value); if (value) setNotice("");}}}>
      <DialogTrigger asChild><Button size="sm" variant="outline" disabled={blocked}><GitBranch className="size-3.5" />{t("Interactive rebase")}</Button></DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col min-h-0" onEscapeKeyDown={(e) => {if (busy) e.preventDefault();}} onPointerDownOutside={(e) => {if (busy) e.preventDefault();}}>
        <DialogHeader><DialogTitle>{t("Interactive rebase")}</DialogTitle><DialogDescription>{t("Edit a linear sequence of local commits. Commits run from top to bottom; the base commit is kept.")}</DialogDescription></DialogHeader>
        <div className="flex gap-2 items-end">
          <label className="flex-1 min-w-0 text-xs space-y-1"><span>{t("Base revision")}</span><Input dir="ltr" aria-label={t("Base revision")} value={base} placeholder="HEAD~3" disabled={busy || loading} onChange={(event) => {setBase(event.target.value); setInfo(null); setSteps([]);}} /></label>
          <Button variant="outline" size="sm" disabled={busy || loading} onClick={() => void load()}>{loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{t("Load commits")}</Button>
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{t(error)}<span className="block mt-1">{t("If rebase stopped with conflicts, close this window, resolve the files, then use Continue operation or Abort operation.")}</span></AlertDescription></Alert>}
        {info?.blockedReason && <Alert variant="destructive"><AlertDescription>{t(info.blockedReason)}</AlertDescription></Alert>}
        {loading && <p className="text-xs text-muted-foreground">{t("Loading commits…")}</p>}
        <div className="flex-1 min-h-0 overflow-auto space-y-2" aria-label={t("Rebase plan")}>
          {steps.map((step, index) => <div key={step.hash} className={`rounded-md border p-2 space-y-2 ${step.action === "drop" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground w-5 shrink-0">{number(index + 1)}</span>
              <code dir="ltr" className="text-[10px] text-muted-foreground shrink-0">{step.hash.slice(0, 8)}</code>
              <span dir="auto" className={`text-xs truncate flex-1 min-w-0 ${step.action === "drop" ? "line-through" : ""}`}>{info?.commits.find((commit) => commit.hash === step.hash)?.subject}</span>
              <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={t("Move {hash} up", {hash: step.hash.slice(0, 8)})} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></Button>
              <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={t("Move {hash} down", {hash: step.hash.slice(0, 8)})} disabled={busy || index === steps.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></Button>
              <Select value={step.action} disabled={busy} onValueChange={(action) => patch(step.hash, {action: action as Step["action"]})}>
                <SelectTrigger className="w-full sm:w-44 shrink-0 text-xs" aria-label={t("Action for {hash}", {hash: step.hash.slice(0, 8)})}><SelectValue /></SelectTrigger>
                <SelectContent>{actions.map((action) => <SelectItem key={action} value={action}>{t(labels[action])}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {["reword", "squash"].includes(step.action) && <Textarea dir="auto" className="text-xs min-h-20" disabled={busy} aria-label={t("Message for {hash}", {hash: step.hash.slice(0, 8)})} value={step.message} onChange={(event) => patch(step.hash, {message: event.target.value})} />}
          </div>)}
        </div>
        {info && !info.blockedReason && <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("Commit IDs change. The original branch tip is saved in Recovery. Reordering or dropping commits may cause conflicts; pushing remains manual.")}</p>
          {invalid && <p className="text-xs text-destructive">{t("Keep at least one commit. The first kept commit must use Keep commit or Edit message. Edited messages cannot be empty.")}</p>}
          {info.published && <label className="flex gap-2 items-start text-xs text-amber-600 dark:text-amber-400"><Checkbox checked={published} disabled={busy} onCheckedChange={(value) => setPublished(value === true)} aria-label={t("I understand this rewrites published history")} /><span>{t("I understand this rewrites published history")}</span></label>}
        </div>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("Cancel")}</Button><Button disabled={busy || blocked || loading || !info || !!info.blockedReason || invalid || (info.published && !published)} onClick={() => void start()}>{busy && <LoaderCircle className="size-3.5 animate-spin" />}{t("Start interactive rebase")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
