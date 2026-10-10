import { copyText } from "@/lib/clipboard";
import { t, number, useLanguage } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { ArrowUpFromLine, ChevronDown, FileCode2, GitCommitHorizontal, LoaderCircle, Minus, Plus, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { SideBySideDiff } from "@/components/side-by-side-diff";
import { native, type ChangedFile, type Repository, type CommitOptionsInfo, type CommitOptionsRequest, type GitToolAction } from "@/lib/native";
import { FileGitAction } from "@/components/rollback-files";
import { ConflictEditor } from "@/components/conflict-editor";
import { FileHistory } from "@/components/file-history";
import { PartialStage } from "@/components/partial-stage";
import { SelectedStash } from "@/components/stash-details";
import { IgnoreFiles, ShowIgnored } from "@/components/ignored-files";
import { PatchTools } from "@/components/patch-tools";
import { CommitMessageLibrary, rememberCommitMessage } from "@/components/commit-message-library";
import { ContextActions, type ContextAction } from "./context-actions";
import { ShelveFiles, Shelves } from "./shelves";
import { DeleteFiles } from "./delete-files";

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
export function VersionControl({ workspaceId, path, revision, onChanged, blocked, onBusyChange }: { workspaceId: string; path: string; revision?: string; onChanged: () => void; blocked: boolean; onBusyChange?: (busy: boolean) => void }) {
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
  const [commitInfo, setCommitInfo] = useState<CommitOptionsInfo | null>(null);
  const lastCommitHead = useRef<string | null>(null);
  const [commitInfoError, setCommitInfoError] = useState("");
  const [amend, setAmend] = useState(false);
  const [signOff, setSignOff] = useState(false);
  const [customAuthor, setCustomAuthor] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [signing, setSigning] = useState<"default"|"yes"|"no">("default");
  const [moreFileActions, setMoreFileActions] = useState(false);
  const [amendReview, setAmendReview] = useState<{request: CommitOptionsRequest; info: CommitOptionsInfo} | null>(null);
  const [preview, setPreview] = useState<{ file: string; staged: boolean; unversioned: boolean } | null>(null);
  const [diff, setDiff] = useState<{ text: string; truncated: boolean } | null>(null);
  const [diffError, setDiffError] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<Group>>(new Set());
  const [contextRollback,setContextRollback]=useState<string[]|null>(null);
  const [contextAction,setContextAction]=useState<GitToolAction>("rollback");
  const [contextShelf,setContextShelf]=useState<string[]|null>(null);
  const [contextHistory,setContextHistory]=useState<string|null>(null);
  const [contextDelete,setContextDelete]=useState<string[]|null>(null);
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
  }, [workspaceId, path, revision, reload]);
  useEffect(() => {
    let cancelled = false;
    setCommitInfo(null); setCommitInfoError("");
    void native.commitOptions(workspaceId, path).then((result) => {
      if (!cancelled) {
        if (lastCommitHead.current !== null && lastCommitHead.current !== result.head) setAmend(false);
        lastCommitHead.current = result.head;
        setCommitInfo(result);
      }
    }, (e) => { if (!cancelled) setCommitInfoError(String(e)); });
    return () => { cancelled = true; };
  }, [workspaceId, path, revision, reload]);
  useEffect(() => { lastCommitHead.current = null; setAmend(false); setSignOff(false); setCustomAuthor(false); setSigning("default"); setAmendReview(null); }, [workspaceId, path]);
  useEffect(() => {
    let cancelled = false;
    setDiff(null); setDiffError("");
    if (preview) void native.diff(workspaceId, path, preview.file, preview.staged).then(
      (value) => { if (!cancelled) setDiff(value); },
      (e) => { if (!cancelled) setDiffError(String(e)); },
    );
    return () => { cancelled = true; };
  }, [workspaceId, path, revision, preview, reload]);
  const groups = fileGroups(state?.files ?? []);
  const locked = busy || blocked || loading || Boolean(loadError);
  async function action(kind: "stage" | "unstage" | "commit", pushAfterCommit = false, reviewed?: CommitOptionsRequest, targetPaths?: string[]) {
    if (locked) return;
    if (kind === "commit" && !reviewed && (!commitInfo || commitInfoError)) return;
    const commitRequest: CommitOptionsRequest = reviewed ?? {reviewToken: commitInfo?.reviewToken ?? "", message, amend, signOff,
      ...(customAuthor ? {author:{name:authorName,email:authorEmail}} : {}), ...(signing === "default" ? {} : {sign:signing === "yes"})};
    if (kind === "commit" && amend && !reviewed) {
      setAmendReview({request: commitRequest, info: commitInfo!});
      return;
    }
    const paths = targetPaths ?? [...new Set([...checked].filter((key) => kind === "unstage" ? key.startsWith("staged:") : !key.startsWith("staged:")).map((key) => key.slice(key.indexOf(":") + 1)))];
    setBusy(true); onBusyChange?.(true); setError(""); setNotice("");
    let committed = false;
    try {
      let result = kind === "commit"
        ? await native.commitReviewed(workspaceId, path, commitRequest)
        : await native.action(workspaceId, path, kind, paths, null);
      if (kind === "commit") {
        committed = true;
        const historyError = rememberCommitMessage(path, commitRequest.message);
        if (historyError) result += "\n" + t(historyError);
        setAmend(false); setCustomAuthor(false); setSigning("default"); setAmendReview(null);
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
    finally { setBusy(false); setAmendReview(null); onBusyChange?.(false); setReload((n) => n + 1); onChanged(); }
  }
  function toggle(keys: string[], value: boolean) {
    setChecked((old) => { const next = new Set(old); for (const key of keys) value ? next.add(key) : next.delete(key); return next; });
  }
  const hasStage = [...checked].some((key) => !key.startsWith("staged:"));
  const hasUnstage = [...checked].some((key) => key.startsWith("staged:"));
  const invalidAuthor = customAuthor && (!authorName.trim() || /[<>\u0000-\u001f]/.test(authorName) || !/^[^\s<>@]+@[^\s<>@]+$/.test(authorEmail.trim()));
  const commitDisabled = locked || !commitInfo || Boolean(commitInfoError) || (!amend && !groups.staged.length) || (amend && !commitInfo?.canAmend) || !message.trim() || Boolean(state?.conflicts) || (signOff && !commitInfo?.signOffIdentity) || invalidAuthor;
  const commitAndPushDisabled = commitDisabled || amend || !state?.upstream || (state?.behind ?? 0) > 0;
  const selectedFiles = [...new Set([...checked].map((key) => key.slice(key.indexOf(":") + 1)))];
  const rollbackPaths = selectedFiles.filter((p) => state?.files.some((f) => f.path === p && f.status !== "??"));
  const deletable = (p:string) => state?.files.some(f=>f.path===p&&f.status[1]!=="D"&&!["DD","AU","UD","UA","DU","AA","UU"].includes(f.status));
  const deletePaths = selectedFiles.filter(deletable);
  const conflictPaths = selectedFiles.filter((p) => state?.files.some((f) => f.path === p && ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(f.status)));
  function filesChanged() { setChecked(new Set()); setPreview(null); setReload((n) => n + 1); onChanged(); }
  function hunksChanged() { setChecked(new Set()); setReload((n) => n + 1); onChanged(); }
  function filesDeleted(result?:string) { if(result){setNotice(result);setError("");} filesChanged(); }
  function fileActions(file:ChangedFile,group:Group):ContextAction[] {
    const key=`${group}:${file.path}`;
    const targets=checked.has(key)?[...new Set([...checked].filter(k=>k.startsWith(`${group}:`)).map(k=>k.slice(k.indexOf(":")+1)))]:[file.path];
    const conflicts=targets.some(p=>state?.files.some(f=>f.path===p&&["DD","AU","UD","UA","DU","AA","UU"].includes(f.status)));
    const tracked=targets.filter(p=>state?.files.some(f=>f.path===p&&f.status!=="??"));
    return [
      {label:t("View diff"),run:()=>setPreview({file:file.path,staged:group==="staged",unversioned:group==="unversioned"})},
      {label:t(group==="staged"?"Unstage selected":"Stage selected"),disabled:locked||conflicts,run:()=>void action(group==="staged"?"unstage":"stage",false,undefined,targets)},
      {label:t("Shelve selected…"),disabled:locked||conflicts,run:()=>setContextShelf(targets)},
      ...(group!=="unversioned"?[{label:t("History"),disabled:locked,run:()=>setContextHistory(file.path)}]:[]),
      ...(conflicts?(["resolve-ours","resolve-theirs","resolve-mark"] as const).map(kind=>({label:t(kind==="resolve-ours"?"Accept ours":kind==="resolve-theirs"?"Accept theirs":"Mark resolved"),disabled:locked,run:()=>{setContextAction(kind);setContextRollback(targets);}})):[]),
      {label:t("Copy relative path"),run:()=>{void copyText(file.path).catch(e=>setError(String(e)));}},
      {label:t("More file actions"),disabled:locked,run:()=>{setChecked(new Set(targets.map(p=>`${group}:${p}`)));setMoreFileActions(true);}},
      ...(tracked.length?[{label:t("Rollback selected"),disabled:locked||conflicts,destructive:true,separator:true,run:()=>{setContextAction("rollback");setContextRollback(tracked);}}]:[]),
      {label:targets.length===1?t("Delete file"):t("Delete files"),disabled:locked||!targets.length||targets.some(p=>!deletable(p)),destructive:true,separator:!tracked.length,run:()=>setContextDelete(targets)},
    ];
  }
  return <div className="flex-1 min-h-0 flex flex-col" data-testid="version-control">
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b">
      <Button variant="outline" size="sm" disabled={locked || !hasStage} onClick={() => void action("stage")}><Plus className="size-3.5" />{t("Stage selected")}</Button>
      <Button variant="outline" size="sm" disabled={locked || !hasUnstage} onClick={() => void action("unstage")}><Minus className="size-3.5" />{t("Unstage selected")}</Button>
      <Shelves workspaceId={workspaceId} path={path} revision={revision} blocked={locked} onBusyChange={onBusyChange} onChanged={filesChanged}/>
      <Button variant="ghost" size="sm" aria-expanded={moreFileActions} aria-controls="more-file-actions" disabled={busy || blocked} onClick={() => setMoreFileActions((value)=>!value)}>{t("More file actions")}<ChevronDown className={`size-3.5 transition-transform ${moreFileActions ? "rotate-180" : ""}`} /></Button>
      <Button variant="ghost" size="sm" className="ms-auto" aria-label={t("Refresh files")} disabled={busy || blocked} onClick={() => { setReload((n) => n + 1); onChanged(); }}>
        {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{t("Refresh")}</Button>
    </div>
    <div id="more-file-actions" hidden={!moreFileActions} className={moreFileActions ? "flex flex-wrap items-center gap-2 border-b px-4 py-2" : "hidden"}>
      <ShelveFiles workspaceId={workspaceId} path={path} paths={selectedFiles} blocked={locked} onBusyChange={onBusyChange} onChanged={filesChanged}/>
      <FileGitAction workspaceId={workspaceId} path={path} paths={rollbackPaths} action="rollback" blocked={locked} onBusyChange={onBusyChange} onChanged={filesChanged} />
      <DeleteFiles workspaceId={workspaceId} path={path} paths={deletePaths} blocked={locked||deletePaths.length!==selectedFiles.length} onBusyChange={onBusyChange} onChanged={filesDeleted}/>

      <SelectedStash workspaceId={workspaceId} path={path} paths={selectedFiles} blocked={locked} onBusyChange={onBusyChange} onChanged={filesChanged}/>
      <IgnoreFiles workspaceId={workspaceId} path={path} paths={selectedFiles.filter((p) => state?.files.some((f) => f.path === p && f.status === "??"))} blocked={locked} onBusyChange={onBusyChange} onChanged={filesChanged}/>
      <PatchTools workspaceId={workspaceId} path={path} paths={rollbackPaths} blocked={locked} onBusyChange={onBusyChange} onChanged={filesChanged}/>
      <ShowIgnored workspaceId={workspaceId} path={path} blocked={locked}/>
    </div>
    {!!conflictPaths.length && <div className="px-4 py-2 border-b flex flex-wrap gap-2 bg-amber-500/10">
      <ConflictEditor workspaceId={workspaceId} path={path} file={conflictPaths.length === 1 ? conflictPaths[0] : ""} blocked={locked} onBusyChange={onBusyChange} onChanged={filesChanged} />
      {(["resolve-ours", "resolve-theirs", "resolve-mark"] as const).map((kind) => <FileGitAction key={kind} workspaceId={workspaceId} path={path} paths={conflictPaths} action={kind} blocked={locked} onBusyChange={onBusyChange} onChanged={filesChanged} />)}
    </div>}
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
                return <ContextActions key={key} label={file.path} actions={fileActions(file,group)}><div className={`ms-5 flex items-center gap-2 px-1 h-7 rounded-sm text-xs transition-colors duration-150 motion-reduce:transition-none ${preview?.file === file.path && preview.staged === (group === "staged") ? "bg-accent" : "hover:bg-muted/40"}`}>
                  <Checkbox aria-label={t("Select {group} {path}", {group: t(group), path: file.path})} disabled={locked} checked={checked.has(key)} onCheckedChange={(value) => toggle([key], value === true)} />
                  <button className="flex gap-2 items-center flex-1 min-w-0 text-start h-full focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setPreview({ file: file.path, staged: group === "staged", unversioned: group === "unversioned" })} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}>
                    <FileCode2 className={`size-3.5 shrink-0 ${group === "staged" ? "text-emerald-500" : group === "unversioned" ? "text-red-400" : "text-blue-500"}`} />
                    <span className={`truncate shrink-0 max-w-[60%] ${group === "unversioned" ? "text-red-400" : ""}`}>{file.path.slice(slash + 1)}</span><span className="truncate text-muted-foreground text-[10px]">{slash >= 0 ? file.path.slice(0, slash) : ""}</span>
                    <code className={`ms-auto shrink-0 text-[10px] ${group === "unversioned" ? "text-red-400" : "text-muted-foreground"}`}>{file.status.trim()}</code>
                  </button>
                </div></ContextActions>;
              })}
                </div>
              </div>
            </section>;
          })}
          {state && !state.files.length && <p className="text-xs text-muted-foreground p-3">{t("Working tree clean.")}</p>}
        </div>
        <footer className="shrink-0 border-t bg-background/95 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="commit-message" className="text-xs font-medium text-muted-foreground">{t("Commit message")}</label>
            <CommitMessageLibrary path={path} message={message} blocked={busy || blocked} onUse={setMessage}/>
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
          {commitInfoError && <p role="alert" className="text-xs text-destructive">{t(commitInfoError)}</p>}
          {amend && <p className="text-[11px] text-amber-600 dark:text-amber-400">{t(commitInfo?.blockedReason ?? "Amend rewrites the last commit. Review before replacing it.")}</p>}
          {signOff && <p className="text-[11px] text-muted-foreground break-words">{commitInfo?.signOffIdentity ? <><span>{t("Sign-off")}: </span><bdi>{commitInfo.signOffIdentity}</bdi></> : t("Configure your Git name and email before adding a sign-off.")}</p>}
          {customAuthor && <div className="space-y-1"><Input aria-label={t("Author name")} placeholder={t("Author name")} value={authorName} disabled={busy || blocked} onChange={(event)=>setAuthorName(event.target.value)} /><Input dir="ltr" aria-label={t("Author email")} placeholder={t("Author email")} value={authorEmail} disabled={busy || blocked} onChange={(event)=>setAuthorEmail(event.target.value)} />{invalidAuthor&&<p className="text-[11px] text-destructive">{t("Enter a valid author name and email.")}</p>}</div>}
          {commitInfo&&<p className="text-[10px] text-muted-foreground truncate" title={commitInfo.signingKey ?? undefined}>{t("Git signing")}: {t(signing === "yes" ? "Sign this commit" : signing === "no" ? "Do not sign this commit" : commitInfo.signingEnabled ? "Enabled" : "Disabled")} · <bdi>{commitInfo.signingFormat ?? "openpgp"}</bdi>{commitInfo.signingKey ? ` · ${commitInfo.signingKey}` : ""}</p>}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button size="sm" className="min-w-0 px-2" disabled={commitDisabled} onClick={() => void action("commit")}>
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <GitCommitHorizontal className="size-3.5" />}
              {t(amend ? "Amend commit…" : "Commit")}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("Commit options")} title={t("Commit options")} className="size-8" disabled={locked}>
                  <Settings2 className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-56">
                <DropdownMenuLabel>{t("Commit options")}</DropdownMenuLabel>
                <DropdownMenuCheckboxItem checked={amend} disabled={!commitInfo?.canAmend} title={commitInfo?.blockedReason ? t(commitInfo.blockedReason) : undefined} onCheckedChange={(value) => {
                  setAmend(value);
                  if (value && commitInfo) setMessage((draft) => draft.trim() ? draft : commitInfo.previousMessage);
                }}>{t("Amend last commit")}</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={signOff} onCheckedChange={setSignOff}>{t("Add Signed-off-by")}</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={customAuthor} onCheckedChange={(value)=>{setCustomAuthor(value);if(value){setAuthorName((amend ? commitInfo?.previousAuthorName : commitInfo?.defaultAuthorName)??"");setAuthorEmail((amend ? commitInfo?.previousAuthorEmail : commitInfo?.defaultAuthorEmail)??"");}}}>{t("Custom commit author")}</DropdownMenuCheckboxItem>
                <DropdownMenuSeparator/><DropdownMenuLabel>{t("Commit signing")}</DropdownMenuLabel><DropdownMenuRadioGroup value={signing} onValueChange={(value)=>setSigning(value as typeof signing)}><DropdownMenuRadioItem value="default">{t("Use Git signing setting")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="yes">{t("Sign this commit")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="no">{t("Do not sign this commit")}</DropdownMenuRadioItem></DropdownMenuRadioGroup><DropdownMenuSeparator/>
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
            title={amend ? t("Amend first, then review outgoing commits before pushing.") : !state?.upstream ? t("Configure an upstream branch to commit and push.") : (state?.behind ?? 0) > 0 ? t("Pull incoming commits before pushing.") : undefined}
            onClick={() => void action("commit", true)}
          >
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowUpFromLine className="size-3.5" />}
            {t("Commit and Push…")}</Button>
        </footer>
      </div>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {preview ? <>
          <div className="px-4 py-2 border-b text-xs flex flex-wrap gap-2 items-center"><span dir="ltr" className="font-mono truncate flex-1 min-w-20" title={preview.file}>{preview.file}</span><FileHistory workspaceId={workspaceId} path={path} file={preview.file} blocked={locked}/>{!preview.unversioned && <PartialStage workspaceId={workspaceId} path={path} file={preview.file} staged={preview.staged} blocked={locked} onBusyChange={onBusyChange} onChanged={hunksChanged}/>}<span className="text-muted-foreground ms-auto shrink-0">{preview.staged ? t("HEAD → Index") : t("Index → Working tree")}</span></div>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden" aria-label={t("File diff")}>
            {diffError ? <p className="px-4 py-3 text-destructive">{t(diffError)}</p> : !diff ? <p className="px-4 py-3 text-muted-foreground">{t("Loading diff…")}</p> : !diff.text ? <p className="px-4 py-3 text-muted-foreground">{t("No text difference in this view.")}</p> : <SideBySideDiff text={diff.text} staged={preview.staged} newFile={preview.unversioned} truncated={diff.truncated} />}
          </div>
        </> : <div className="flex-1 grid place-items-center p-6 text-xs text-muted-foreground text-center"><div><FileCode2 className="size-6 mx-auto mb-3 opacity-50" />{t("Select a file to review its diff.")}<br /><span className="block mt-2">{t("Stage your selection, then commit the staged files.")}</span></div></div>}
      </div>
    </div>
    <DeleteFiles workspaceId={workspaceId} path={path} paths={contextDelete??[]} open={contextDelete!==null} onOpenChange={value=>{if(!value)setContextDelete(null);}} hideTrigger blocked={locked} onBusyChange={onBusyChange} onChanged={filesDeleted}/>
    <FileGitAction workspaceId={workspaceId} path={path} paths={contextRollback??[]} action={contextAction} open={contextRollback!==null} onOpenChange={value=>{if(!value)setContextRollback(null);}} hideTrigger blocked={locked} onBusyChange={onBusyChange} onChanged={filesChanged}/>
    <ShelveFiles workspaceId={workspaceId} path={path} paths={contextShelf??[]} open={contextShelf!==null} onOpenChange={value=>{if(!value)setContextShelf(null);}} hideTrigger blocked={locked} onBusyChange={onBusyChange} onChanged={filesChanged}/>
    <FileHistory workspaceId={workspaceId} path={path} file={contextHistory??""} open={contextHistory!==null} onOpenChange={value=>{if(!value)setContextHistory(null);}} hideTrigger blocked={locked}/>
    <Dialog open={!!amendReview} onOpenChange={(open) => { if (!open && !busy) setAmendReview(null); }}>
      <DialogContent className="max-w-lg" onEscapeKeyDown={(e) => {if (busy) e.preventDefault();}} onPointerDownOutside={(e) => {if (busy) e.preventDefault();}}>
        <DialogHeader><DialogTitle>{t("Amend last commit")}</DialogTitle><DialogDescription>{t("Replace the last commit with the current index and this message. Unstaged files are preserved.")}</DialogDescription></DialogHeader>
        {amendReview && <div className="space-y-3 min-w-0">
          <code dir="ltr" className="block break-all text-xs text-muted-foreground">{amendReview.info.head}</code>
          <p className="text-xs">{t("{count} staged", {count: amendReview.info.staged})}</p>
          <pre dir="auto" className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-xs">{amendReview.request.message}</pre>
          {amendReview.request.signOff && <p className="text-xs"><span>{t("Sign-off")}: </span><bdi>{amendReview.info.signOffIdentity}</bdi></p>}
          {amendReview.request.author&&<p className="text-xs"><span>{t("Custom commit author")}: </span><bdi>{amendReview.request.author.name} &lt;{amendReview.request.author.email}&gt;</bdi></p>}
          <p className="text-xs">{t("Commit signing")}: {t(amendReview.request.sign === true ? "Sign this commit" : amendReview.request.sign === false ? "Do not sign this commit" : "Use Git signing setting")}</p>
          <Alert className="border-amber-500/40"><AlertDescription>{t(amendReview.info.published ? "This commit exists in a remote-tracking branch. Amending rewrites shared history. Coordinate with collaborators; GitOrbit will not force-push it." : "Amending changes the commit ID. A local recovery reference preserves the original commit.")}</AlertDescription></Alert>
        </div>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setAmendReview(null)}>{t("Cancel")}</Button><Button disabled={locked || !amendReview} onClick={() => {if (amendReview) void action("commit", false, amendReview.request);}}>{busy && <LoaderCircle className="size-3.5 animate-spin" />}{t("Amend commit")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
