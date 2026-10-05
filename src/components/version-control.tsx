import { t, number, useLanguage } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { ArrowUpFromLine, ChevronDown, FileCode2, GitCommitHorizontal, LoaderCircle, Minus, Plus, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SideBySideDiff } from "@/components/side-by-side-diff";
import { native, type ChangedFile, type Repository } from "@/lib/native";

type Group = "staged" | "changes" | "unversioned";
const keepMessageKey = "workspace-monitor-keep-commit-message";

function readKeepMessagePreference() {
  return typeof window !== "undefined" && localStorage.getItem(keepMessageKey) === "true";
}

export function fileGroups(files: ChangedFile[]) {
  return {
    staged: files.filter((f) => f.status !== "??" && ![" ", "."].includes(f.status[0])),
    changes: files.filter((f) => f.status !== "??" && ![" ", "."].includes(f.status[1])),
    unversioned: files.filter((f) => f.status === "??"),
  };
}
export function VersionControl({ workspaceId, path, onChanged, blocked, onBusyChange }: { workspaceId: string; path: string; onChanged: () => void; blocked: boolean; onBusyChange?: (busy: boolean) => void }) {
  const { direction } = useLanguage();
  const [state, setState] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [keepMessage, setKeepMessage] = useState(readKeepMessagePreference);
  const [preview, setPreview] = useState<{ file: string; staged: boolean; unversioned: boolean } | null>(null);
  const [diff, setDiff] = useState<{ text: string; truncated: boolean } | null>(null);
  const [diffError, setDiffError] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<Group>>(new Set());
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
  }, [workspaceId, path, reload]);
  useEffect(() => {
    let cancelled = false;
    setDiff(null); setDiffError("");
    if (preview) void native.diff(workspaceId, path, preview.file, preview.staged).then(
      (value) => { if (!cancelled) setDiff(value); },
      (e) => { if (!cancelled) setDiffError(String(e)); },
    );
    return () => { cancelled = true; };
  }, [workspaceId, path, preview, reload]);
  const groups = fileGroups(state?.files ?? []);
  const locked = busy || blocked || loading || Boolean(loadError);
  async function action(kind: "stage" | "unstage" | "commit", pushAfterCommit = false) {
    if (locked) return;
    const paths = [...new Set([...checked].filter((key) => kind === "unstage" ? key.startsWith("staged:") : !key.startsWith("staged:")).map((key) => key.slice(key.indexOf(":") + 1)))];
    setBusy(true); onBusyChange?.(true); setError(""); setNotice("");
    let committed = false;
    try {
      let result = await native.action(workspaceId, path, kind, kind === "commit" ? [] : paths, kind === "commit" ? message : null);
      if (kind === "commit") {
        committed = true;
        if (!keepMessage) setMessage("");
        if (pushAfterCommit) {
          const outgoing = await native.outgoing(workspaceId, path);
          result += outgoing.totalCommits > 0
            ? `\n${await native.push(workspaceId, path, outgoing.head, outgoing.upstreamHead)}`
            : "\n" + t("There are no outgoing commits to push.");
        }
      }
      setNotice(result);
      setChecked(new Set()); setPreview(null);
    } catch (e) {
      setNotice("");
      setError(committed ? t("Commit created, but push failed: {error}", {error: String(e)}) : String(e));
    }
    finally { setBusy(false); onBusyChange?.(false); setReload((n) => n + 1); onChanged(); }
  }
  function toggle(keys: string[], value: boolean) {
    setChecked((old) => { const next = new Set(old); for (const key of keys) value ? next.add(key) : next.delete(key); return next; });
  }
  const hasStage = [...checked].some((key) => !key.startsWith("staged:"));
  const hasUnstage = [...checked].some((key) => key.startsWith("staged:"));
  const commitDisabled = locked || !groups.staged.length || !message.trim() || Boolean(state?.conflicts);
  const commitAndPushDisabled = commitDisabled || !state?.upstream || (state?.behind ?? 0) > 0;
  return <div className="flex-1 min-h-0 flex flex-col" data-testid="version-control">
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b">
      <Button variant="outline" size="sm" disabled={locked || !hasStage} onClick={() => void action("stage")}><Plus className="size-3.5" />{t("Stage selected")}</Button>
      <Button variant="outline" size="sm" disabled={locked || !hasUnstage} onClick={() => void action("unstage")}><Minus className="size-3.5" />{t("Unstage selected")}</Button>
      <Button variant="ghost" size="sm" className="ms-auto" aria-label={t("Refresh files")} disabled={busy || blocked} onClick={() => { setReload((n) => n + 1); onChanged(); }}>
        {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{t("Refresh")}</Button>
    </div>
    {(error || loadError || notice) && <Alert variant={error || loadError ? "destructive" : "default"} className="mx-4 my-2 w-auto py-2"><AlertDescription>{t(error || loadError || notice)}</AlertDescription></Alert>}
    <div className="flex flex-1 min-h-0 flex-col md:flex-row">
      <div className="md:w-[360px] md:shrink-0 border-b md:border-b-0 md:border-e flex flex-col min-h-0 max-h-[45%] md:max-h-none">
        <div className="flex-1 min-h-0 overflow-auto p-2">
          {loading && !state && <p className="text-xs text-muted-foreground p-3">{t("Reading changed files…")}</p>}
          {(["staged", "changes", "unversioned"] as Group[]).map((group) => {
            const files = groups[group]; const keys = files.map((f) => `${group}:${f.path}`);
            const selectedCount = keys.filter((key) => checked.has(key)).length;
            const collapsed = collapsedGroups.has(group);
            return <section key={group} className="mb-1">
              <div className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors duration-150 hover:bg-muted/40 motion-reduce:transition-none">
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  aria-controls={`file-group-${group}`}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 text-start text-xs focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => {
                    setCollapsedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(group)) next.delete(group);
                      else next.add(group);
                      return next;
                    });
                  }}
                >
                  <ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none ${collapsed ? direction === "rtl" ? "rotate-90" : "-rotate-90" : "rotate-0"}`} />
                  <span className="font-medium">{group === "staged" ? t("Staged") : group === "changes" ? t("Changes") : t("Unversioned Files")}</span>
                  <span className="text-muted-foreground">{number(files.length)}</span>
                </button>
                <Checkbox aria-label={t("Select all {group}", {group: t(group)})} disabled={locked || !files.length} checked={selectedCount === files.length && files.length > 0 ? true : selectedCount > 0 ? "indeterminate" : false} onCheckedChange={(value) => toggle(keys, value === true)} />
              </div>
              <div
                id={`file-group-${group}`}
                aria-hidden={collapsed}
                inert={collapsed}
                className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
              >
                <div className="min-h-0 overflow-hidden">
                {files.map((file) => {
                const key = `${group}:${file.path}`; const slash = file.path.lastIndexOf("/");
                return <div key={key} className={`ms-5 flex items-center gap-2 px-1 h-7 rounded-sm text-xs transition-colors duration-150 motion-reduce:transition-none ${preview?.file === file.path && preview.staged === (group === "staged") ? "bg-accent" : "hover:bg-muted/40"}`}>
                  <Checkbox aria-label={t("Select {group} {path}", {group: t(group), path: file.path})} disabled={locked} checked={checked.has(key)} onCheckedChange={(value) => toggle([key], value === true)} />
                  <button className="flex gap-2 items-center flex-1 min-w-0 text-start h-full focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setPreview({ file: file.path, staged: group === "staged", unversioned: group === "unversioned" })} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}>
                    <FileCode2 className={`size-3.5 shrink-0 ${group === "staged" ? "text-emerald-500" : group === "unversioned" ? "text-red-400" : "text-blue-500"}`} />
                    <span className={`truncate shrink-0 max-w-[60%] ${group === "unversioned" ? "text-red-400" : ""}`}>{file.path.slice(slash + 1)}</span><span className="truncate text-muted-foreground text-[10px]">{slash >= 0 ? file.path.slice(0, slash) : ""}</span>
                    <code className={`ms-auto shrink-0 text-[10px] ${group === "unversioned" ? "text-red-400" : "text-muted-foreground"}`}>{file.status.trim()}</code>
                  </button>
                </div>;
              })}
                </div>
              </div>
            </section>;
          })}
          {state && !state.files.length && <p className="text-xs text-muted-foreground p-3">{t("Working tree clean.")}</p>}
        </div>
        <footer className="shrink-0 border-t bg-background/95 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="commit-message" className="text-xs font-medium text-muted-foreground">{t("Commit message")}</label>
            <span className="text-[10px] text-muted-foreground">{t("{count} staged", {count: groups.staged.length})}</span>
          </div>
          <Textarea dir="auto"             id="commit-message"
            aria-label={t("Commit Message")}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("Commit Message")}
            className="min-h-16 max-h-28 resize-y px-3 py-2 text-xs leading-5"
            disabled={busy || blocked}
          />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button size="sm" className="min-w-0 px-2" disabled={commitDisabled} onClick={() => void action("commit")}>
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <GitCommitHorizontal className="size-3.5" />}
              {t("Commit")}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("Commit options")} title={t("Commit options")} className="size-8">
                  <Settings2 className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-56">
                <DropdownMenuLabel>{t("Commit options")}</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={keepMessage}
                  onCheckedChange={(value) => {
                    setKeepMessage(value);
                    localStorage.setItem(keepMessageKey, String(value));
                  }}
                >
                  {t("Keep message after commit")}</DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={commitAndPushDisabled}
            title={!state?.upstream ? t("Configure an upstream branch to commit and push.") : (state?.behind ?? 0) > 0 ? t("Pull incoming commits before pushing.") : undefined}
            onClick={() => void action("commit", true)}
          >
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowUpFromLine className="size-3.5" />}
            {t("Commit and Push…")}</Button>
        </footer>
      </div>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {preview ? <>
          <div className="px-4 py-2 border-b text-xs flex gap-2 items-center"><span dir="ltr" className="font-mono truncate" title={preview.file}>{preview.file}</span><span className="text-muted-foreground ms-auto shrink-0">{preview.staged ? t("HEAD → Index") : t("Index → Working tree")}</span></div>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden" aria-label={t("File diff")}>
            {diffError ? <p className="px-4 py-3 text-destructive">{t(diffError)}</p> : !diff ? <p className="px-4 py-3 text-muted-foreground">{t("Loading diff…")}</p> : !diff.text ? <p className="px-4 py-3 text-muted-foreground">{t("No text difference in this view.")}</p> : <SideBySideDiff text={diff.text} staged={preview.staged} newFile={preview.unversioned} truncated={diff.truncated} />}
          </div>
        </> : <div className="flex-1 grid place-items-center p-6 text-xs text-muted-foreground text-center"><div><FileCode2 className="size-6 mx-auto mb-3 opacity-50" />{t("Select a file to review its diff.")}<br /><span className="block mt-2">{t("Stage your selection, then commit the staged files.")}</span></div></div>}
      </div>
    </div>
  </div>;
}
