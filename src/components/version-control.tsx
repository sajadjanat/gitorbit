import { useEffect, useState } from "react";
import { ChevronDown, FileCode2, GitCommitHorizontal, LoaderCircle, Minus, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { native, type ChangedFile, type Repository } from "@/lib/native";

type Group = "staged" | "changes" | "unversioned";
export function fileGroups(files: ChangedFile[]) {
  return {
    staged: files.filter((f) => f.status !== "??" && ![" ", "."].includes(f.status[0])),
    changes: files.filter((f) => f.status !== "??" && ![" ", "."].includes(f.status[1])),
    unversioned: files.filter((f) => f.status === "??"),
  };
}
export function VersionControl({ workspaceId, path, refreshedAt, onChanged, blocked, onBusyChange }: { workspaceId: string; path: string; refreshedAt?: number; onChanged: () => void; blocked: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [state, setState] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ file: string; staged: boolean } | null>(null);
  const [diff, setDiff] = useState<{ text: string; truncated: boolean } | null>(null);
  const [diffError, setDiffError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void native.changes(workspaceId, path).then((result) => {
      if (cancelled) return;
      setState(result); setLoadError("");
      const groups = fileGroups(result.files);
      const valid = new Set(Object.entries(groups).flatMap(([group, files]) => files.map((f) => `${group}:${f.path}`)));
      setChecked((old) => new Set([...old].filter((key) => valid.has(key))));
    }, (e) => { if (!cancelled) setLoadError(String(e)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, path, refreshedAt, reload]);
  useEffect(() => {
    let cancelled = false;
    setDiff(null); setDiffError("");
    if (preview) void native.diff(workspaceId, path, preview.file, preview.staged).then(
      (value) => { if (!cancelled) setDiff(value); },
      (e) => { if (!cancelled) setDiffError(String(e)); },
    );
    return () => { cancelled = true; };
  }, [workspaceId, path, preview, reload, refreshedAt]);
  const groups = fileGroups(state?.files ?? []);
  const locked = busy || blocked || loading || Boolean(loadError);
  async function action(kind: "stage" | "unstage" | "commit") {
    if (locked) return;
    const paths = [...new Set([...checked].filter((key) => kind === "unstage" ? key.startsWith("staged:") : !key.startsWith("staged:")).map((key) => key.slice(key.indexOf(":") + 1)))];
    setBusy(true); onBusyChange?.(true); setError(""); setNotice("");
    try {
      setNotice(await native.action(workspaceId, path, kind, kind === "commit" ? [] : paths, kind === "commit" ? message : null));
      if (kind === "commit") setMessage("");
      setChecked(new Set()); setPreview(null);
    } catch (e) { setNotice(""); setError(String(e)); }
    finally { setBusy(false); onBusyChange?.(false); setReload((n) => n + 1); onChanged(); }
  }
  function toggle(keys: string[], value: boolean) {
    setChecked((old) => { const next = new Set(old); for (const key of keys) value ? next.add(key) : next.delete(key); return next; });
  }
  const hasStage = [...checked].some((key) => !key.startsWith("staged:"));
  const hasUnstage = [...checked].some((key) => key.startsWith("staged:"));
  return <div className="flex-1 min-h-0 flex flex-col" data-testid="version-control">
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b">
      <Button variant="outline" size="sm" disabled={locked || !hasStage} onClick={() => void action("stage")}><Plus className="size-3.5" />Stage selected</Button>
      <Button variant="outline" size="sm" disabled={locked || !hasUnstage} onClick={() => void action("unstage")}><Minus className="size-3.5" />Unstage selected</Button>
      <Button variant="ghost" size="sm" className="ml-auto" aria-label="Refresh files" disabled={busy || blocked} onClick={() => { setReload((n) => n + 1); onChanged(); }}>
        {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Refresh
      </Button>
    </div>
    {(error || loadError || notice) && <Alert variant={error || loadError ? "destructive" : "default"} className="mx-4 my-2 w-auto py-2"><AlertDescription>{error || loadError || notice}</AlertDescription></Alert>}
    <div className="flex flex-1 min-h-0 flex-col md:flex-row">
      <div className="md:w-[360px] md:shrink-0 border-b md:border-b-0 md:border-r flex flex-col min-h-0 max-h-[45%] md:max-h-none">
        <div className="flex-1 min-h-0 overflow-auto p-2">
          {loading && !state && <p className="text-xs text-muted-foreground p-3">Reading changed files…</p>}
          {(["staged", "changes", "unversioned"] as Group[]).map((group) => {
            const files = groups[group]; const keys = files.map((f) => `${group}:${f.path}`);
            const selectedCount = keys.filter((key) => checked.has(key)).length;
            return <details key={group} open className="mb-1"><summary className="list-none flex items-center gap-2 py-2 px-1 text-xs cursor-pointer select-none">
              <ChevronDown className="size-3.5 text-muted-foreground" />
              <span onClick={(e) => e.stopPropagation()}><Checkbox aria-label={`Select all ${group}`} disabled={locked || !files.length} checked={selectedCount === files.length && files.length > 0 ? true : selectedCount > 0 ? "indeterminate" : false} onCheckedChange={(value) => toggle(keys, value === true)} /></span>
              <span className="font-medium">{group === "staged" ? "Staged" : group === "changes" ? "Changes" : "Unversioned Files"}</span><span className="text-muted-foreground">{files.length}</span>
            </summary>
              {files.map((file) => {
                const key = `${group}:${file.path}`; const slash = file.path.lastIndexOf("/");
                return <div key={key} className={`ml-5 flex items-center gap-2 px-1 h-7 rounded-sm text-xs ${preview?.file === file.path && preview.staged === (group === "staged") ? "bg-accent" : "hover:bg-muted/40"}`}>
                  <Checkbox aria-label={`Select ${group} ${file.path}`} disabled={locked} checked={checked.has(key)} onCheckedChange={(value) => toggle([key], value === true)} />
                  <button className="flex gap-2 items-center flex-1 min-w-0 text-left h-full focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setPreview({ file: file.path, staged: group === "staged" })} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}>
                    <FileCode2 className={`size-3.5 shrink-0 ${group === "staged" ? "text-emerald-500" : group === "unversioned" ? "text-amber-500" : "text-blue-500"}`} />
                    <span className="truncate shrink-0 max-w-[60%]">{file.path.slice(slash + 1)}</span><span className="truncate text-muted-foreground text-[10px]">{slash >= 0 ? file.path.slice(0, slash) : ""}</span>
                    <code className="ml-auto shrink-0 text-[10px] text-muted-foreground">{file.status.trim()}</code>
                  </button>
                </div>;
              })}
            </details>;
          })}
          {state && !state.files.length && <p className="text-xs text-muted-foreground p-3">Working tree clean.</p>}
        </div>
        <div className="border-t p-3 space-y-2 shrink-0">
          <label htmlFor="commit-message" className="text-xs font-medium">Commit message</label>
          <Textarea id="commit-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe your changes…" className="text-xs min-h-16 max-h-28" disabled={busy || blocked} />
          <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">{groups.staged.length} staged file{groups.staged.length === 1 ? "" : "s"}</span>
            <Button size="sm" disabled={locked || !groups.staged.length || !message.trim() || Boolean(state?.conflicts)} onClick={() => void action("commit")}>{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <GitCommitHorizontal className="size-3.5" />}Commit staged</Button>
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {preview ? <>
          <div className="px-4 py-2 border-b text-xs flex gap-2 items-center"><span className="font-mono truncate" title={preview.file}>{preview.file}</span><span className="text-muted-foreground ml-auto shrink-0">{preview.staged ? "HEAD → Index" : "Index → Working tree"}</span></div>
          <div className="flex-1 overflow-auto font-mono text-[11px] leading-5 py-2" aria-label="File diff">
            {diffError ? <p className="px-4 text-destructive">{diffError}</p> : !diff ? <p className="px-4 text-muted-foreground">Loading diff…</p> : !diff.text ? <p className="px-4 text-muted-foreground">No text difference in this view.</p> : diff.text.split("\n").map((line, i) => <div key={i} className={`px-4 whitespace-pre min-w-max ${line.startsWith("+") && !line.startsWith("+++") ? "diff-added" : line.startsWith("-") && !line.startsWith("---") ? "diff-removed" : line.startsWith("@@") ? "text-blue-500 bg-muted/30" : "text-muted-foreground"}`}>{line || " "}</div>)}
            {diff?.truncated && <p className="px-4 text-amber-500">Preview truncated at 512 KB.</p>}
          </div>
        </> : <div className="flex-1 grid place-items-center p-6 text-xs text-muted-foreground text-center"><div><FileCode2 className="size-6 mx-auto mb-3 opacity-50" />Select a file to review its diff.<br /><span className="block mt-2">Stage your selection, then commit the staged files.</span></div></div>}
      </div>
    </div>
  </div>;
}
