import { copyText } from "@/lib/clipboard";
import { date, plural, t } from "@/lib/i18n";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpFromLine,
  FileCode2,
  FileMinus2,
  FilePlus2,
  FileQuestion,
  FileSymlink,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SideBySideDiff } from "@/components/side-by-side-diff";
import { ContextActions } from "./context-actions";
import { FileHistory } from "./file-history";
import { GitAuthentication } from "@/components/git-authentication";
import { GitSync } from "@/components/git-sync";
import { isAuthenticationError, isSyncError, redactGitError } from "@/lib/git-errors";
import { native, type CommitDiff, type CommitFile, type Outgoing, type OutgoingCommit } from "@/lib/native";

const dateFormat = { format: (value: Date) => date(value, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) };

function changeLabel(status: string) {
  switch (status[0]) {
    case "A": return { label: "Added", className: "text-emerald-500", Icon: FilePlus2 };
    case "D": return { label: "Deleted", className: "text-red-400", Icon: FileMinus2 };
    case "R": return { label: "Renamed", className: "text-violet-400", Icon: FileSymlink };
    case "C": return { label: "Copied", className: "text-violet-400", Icon: FileSymlink };
    case "T": return { label: "Type changed", className: "text-amber-400", Icon: FileQuestion };
    case "M": return { label: "Modified", className: "text-blue-400", Icon: FileCode2 };
    default: return { label: status, className: "text-muted-foreground", Icon: FileCode2 };
  }
}

function CommitItem({
  commit,
  selected,
  onSelect,
}: {
  commit: OutgoingCommit;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full rounded-sm px-3 py-3 text-start transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring ${selected ? "bg-accent" : ""}`}
    >
      <span className="block text-xs font-medium leading-5 break-words">
        {commit.subject || t("(no commit message)")}
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
        <span dir="ltr" className="font-mono">{commit.hash.slice(0, 8)}</span>
        <span className="truncate">{commit.author}</span>
        <span className="ms-auto tabular-nums">
          {dateFormat.format(new Date(commit.timestamp * 1000))}
        </span>
      </span>
    </button>
  );
}

function FileItem({ file, selected, onSelect, buttonRef }: { file: CommitFile; selected: boolean; onSelect: () => void; buttonRef: (node: HTMLButtonElement | null) => void }) {
  const change = changeLabel(file.status);
  const displayPath = file.originalPath
    ? `${file.originalPath} → ${file.path}`
    : file.path;
  return (
    <button ref={buttonRef} type="button" aria-pressed={selected} onClick={onSelect} className={`flex w-full min-w-0 items-center gap-2 px-3 py-2 text-start text-xs hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring ${selected ? "bg-accent" : ""}`} title={displayPath}>
      <change.Icon className={`size-3.5 shrink-0 ${change.className}`} />
      <span dir="ltr" className="min-w-0 flex-1 truncate font-mono">{displayPath}</span>
      <span className={`shrink-0 text-[10px] ${change.className}`}>{t(change.label)}</span>
    </button>
  );
}

export function PushPreview({
  workspaceId,
  path,
  upstream,
  behind,
  onPushed,
  blocked = false,
  onBusyChange,
  onReviewChanges,
}: {
  workspaceId: string;
  path: string;
  upstream: string | null;
  behind: number | null;
  onPushed: () => void;
  blocked?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onReviewChanges?: () => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const [outgoing, setOutgoing] = useState<Outgoing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncNeeded, setSyncNeeded] = useState(false);
  useEffect(() => { setSyncNeeded(false); }, [workspaceId, path]);
  useEffect(() => { if ((behind ?? 0) > 0) setSyncNeeded(true); }, [workspaceId, path, behind]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [files, setFiles] = useState<CommitFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState("");
  const [pushing, setPushing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ commitHash: string; file: CommitFile } | null>(null);
  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [diffError, setDiffError] = useState("");
  const fileButtons = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<string | null>(null);
  const previewFile = selectedFile?.commitHash === selectedHash && !loading ? selectedFile.file : null;

  useLayoutEffect(() => {
    if (!previewFile && returnFocus.current) {
      fileButtons.current.get(returnFocus.current)?.focus();
      returnFocus.current = null;
    }
  }, [previewFile]);

  useEffect(() => {
    let cancelled = false;
    setOutgoing(null);
    setSelectedHash(null);
    setSelectedFile(null);
    setFiles([]);
    setFilesError("");
    setError("");
    if (!upstream) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void native.outgoing(workspaceId, path).then(
      (result) => {
        if (cancelled) return;
        setOutgoing(result);
        setSelectedHash(result.commits[0]?.hash ?? null);
      },
      (reason) => { if (!cancelled) setError(String(reason)); },
    ).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, path, upstream, refresh]);

  useEffect(() => {
    setSelectedFile(null);
    if (!selectedHash) {
      setFiles([]);
      setFilesLoading(false);
      setFilesError("");
      return;
    }
    let cancelled = false;
    setFiles([]);
    setFilesError("");
    setFilesLoading(true);
    void native.commitFiles(workspaceId, path, selectedHash).then(
      (result) => { if (!cancelled) setFiles(result); },
      (reason) => { if (!cancelled) setFilesError(String(reason)); },
    ).finally(() => { if (!cancelled) setFilesLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, path, selectedHash]);

  useEffect(() => {
    setDiff(null);
    setDiffError("");
    if (!selectedFile || selectedFile.commitHash !== selectedHash) return;
    let cancelled = false;
    void native.commitDiff(workspaceId, path, selectedFile.commitHash, selectedFile.file.path).then(
      (result) => { if (!cancelled) setDiff(result); },
      (reason) => { if (!cancelled) setDiffError(String(reason)); },
    );
    return () => { cancelled = true; };
  }, [workspaceId, path, selectedHash, selectedFile]);

  const selectedCommit = outgoing?.commits.find((commit) => commit.hash === selectedHash);
  const cannotPush = blocked || syncNeeded || isSyncError(error) || !outgoing || loading || pushing || outgoing.totalCommits === 0 || !selectedHash || filesLoading || Boolean(filesError) || (behind ?? 0) > 0;

  async function push() {
    if (cannotPush || !outgoing) return;
    setPushing(true); onBusyChange?.(true);
    setError("");
    setNotice("");
    try {
      setNotice(await native.push(workspaceId, path, outgoing.head, outgoing.upstreamHead));
      onPushed();
      setRefresh((value) => value + 1);
    } catch (reason) {
      setError(String(reason));
      if (isSyncError(String(reason))) setSyncNeeded(true);
    } finally {
      setPushing(false); onBusyChange?.(false);
    }
  }

  const [historyFile,setHistoryFile]=useState<string|null>(null);
  function renderFiles() {
    return <div className="min-h-0 flex-1 overflow-auto py-1">
      {filesLoading && <p className="p-4 text-xs text-muted-foreground">{t("Reading changed files…")}</p>}
      {filesError && <Alert variant="destructive" className="m-3 w-auto"><AlertDescription>{t(filesError)}</AlertDescription></Alert>}
      {!filesLoading && !filesError && selectedCommit && !files.length && <p className="p-4 text-xs text-muted-foreground">{t("No file changes in this commit.")}</p>}
      {!filesLoading && files.map((file) => {const preview=()=>{if(selectedHash){setDiff(null);setDiffError("");setSelectedFile({commitHash:selectedHash,file});}};return <ContextActions key={`${file.status}-${file.path}`} label={file.path} actions={[{label:t("View diff"),run:preview},{label:t("History"),run:()=>setHistoryFile(file.path)},{label:t("Copy relative path"),run:()=>{void copyText(file.path).catch(e=>setError(String(e)));}}]}><div><FileItem file={file} selected={previewFile?.path === file.path} onSelect={preview} buttonRef={(node)=>{if(node)fileButtons.current.set(file.path,node);else fileButtons.current.delete(file.path);}}/></div></ContextActions>;})}
      <FileHistory workspaceId={workspaceId} path={path} file={historyFile??""} open={historyFile!==null} hideTrigger onOpenChange={value=>{if(!value)setHistoryFile(null);}}/>
      {!loading && !selectedCommit && !error && upstream && outgoing?.totalCommits === 0 && <p className="p-4 text-xs text-muted-foreground">{t("Create a commit first, then review it here before pushing.")}</p>}
    </div>;
  }

  function filesHeading() {
    return <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2 text-xs">
      <span className="truncate font-medium" title={selectedCommit?.subject}>{selectedCommit?.subject ?? t("Changed files")}</span>
      <span dir="ltr" className="shrink-0 font-mono text-muted-foreground">{selectedCommit?.hash.slice(0, 8) ?? ""}</span>
    </div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="push-preview">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        {outgoing ? (
          <div className="inline-flex min-w-0 items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
            <span className="truncate font-medium">{outgoing.sourceBranch}</span>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            <span dir="ltr" className="truncate font-mono text-muted-foreground">
              {outgoing.remote}:{outgoing.destinationBranch}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {upstream ? t("Reading the push destination…") : t("No upstream branch is configured.")}
          </p>
        )}
        <div className="ms-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("Refresh outgoing commits")}
            disabled={blocked || loading || pushing || !upstream}
            onClick={() => { setNotice(""); setRefresh((value) => value + 1); }}
          >
            <RefreshCw className="size-3.5" />{t("Refresh")}</Button>
          <Button size="sm" disabled={cannotPush} onClick={() => void push()}>
            {pushing ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowUpFromLine className="size-3.5" />}
            {pushing ? t("Pushing…") : plural(outgoing?.totalCommits ?? 0, "Push {count} commit", "Push {count} commits")}
          </Button>
        </div>
      </div>

      {error && !isSyncError(error) && (isAuthenticationError(error) && outgoing ? <GitAuthentication key={`${workspaceId}-${path}-${error}`} workspaceId={workspaceId} path={path} error={error} expectedHead={outgoing.head} expectedUpstreamHead={outgoing.upstreamHead} blocked={blocked || pushing} onBusyChange={onBusyChange} onRetry={() => void push()} /> : <Alert variant="destructive" className="mx-4 mt-3 w-auto"><AlertDescription>{t(redactGitError(error))}</AlertDescription></Alert>)}
      {notice && <Alert className="mx-4 mt-3 w-auto"><AlertDescription className="whitespace-pre-wrap">{t(notice)}</AlertDescription></Alert>}
      {(syncNeeded || isSyncError(error) || (behind ?? 0) > 0) && upstream && <GitSync key={`${workspaceId}-${path}`} workspaceId={workspaceId} path={path} error={error} blocked={blocked || pushing} onBusyChange={onBusyChange} onChanged={onPushed} onReady={() => { setSyncNeeded(false); setError(""); setNotice(""); setRefresh(value => value + 1); onPushed(); }} onReviewChanges={onReviewChanges} />}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section aria-label={previewFile ? t("Files in selected commit") : t("Outgoing commits")} className={`flex min-h-0 min-w-0 flex-col border-b md:shrink-0 md:border-b-0 md:border-e ${previewFile ? "max-md:max-h-[30%] md:w-[28%]" : "md:w-[44%]"}`}>
          {previewFile ? <>{filesHeading()}{renderFiles()}</> : <>
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 text-xs">
            <span className="font-medium">{t("Outgoing commits")}</span>
            <span className="text-muted-foreground tabular-nums">{loading ? "…" : outgoing?.totalCommits ?? 0}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1">
            {loading && <p className="p-4 text-xs text-muted-foreground">{t("Reading commits…")}</p>}
            {!loading && outgoing?.commits.map((commit) => (
              <CommitItem
                key={commit.hash}
                commit={commit}
                selected={selectedHash === commit.hash}
                onSelect={() => setSelectedHash(commit.hash)}
              />
            ))}
            {!loading && outgoing?.totalCommits === 0 && !error && (
              <p className="p-4 text-xs text-muted-foreground">{t("Nothing to push. This branch matches its tracked remote.")}</p>
            )}
            {!loading && !upstream && (
              <p className="p-4 text-xs text-muted-foreground">{t("Set an upstream branch to see and push outgoing commits.")}</p>
            )}
            {!loading && outgoing?.hasMore && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">{t("Showing {shown} of {total} commits; Push will include all outgoing commits.", {shown: outgoing.commits.length, total: outgoing.totalCommits})}</p>
            )}
          </div>
          </>}
        </section>

        <section aria-label={previewFile ? t("File diff") : t("Files in selected commit")} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {previewFile ? <>
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs">
              <span dir="ltr" className="min-w-0 flex-1 truncate font-mono" title={previewFile.path}>{previewFile.path}</span>
              <Button variant="ghost" size="icon-sm" aria-label={t("Back to outgoing commits")} title={t("Back to outgoing commits")} onClick={() => { returnFocus.current = previewFile.path; setSelectedFile(null); }}><X className="size-4" /></Button>
            </div>
            <div className="min-h-0 min-w-0 flex-1">
              {diffError ? <p role="alert" className="px-4 py-3 text-xs text-destructive">{t(diffError)}</p> : !diff ? <p className="px-4 py-3 text-xs text-muted-foreground">{t("Loading diff…")}</p> : !diff.text ? <p className="px-4 py-3 text-xs text-muted-foreground">{t("No text difference in this view.")}</p> : <SideBySideDiff key={`${selectedHash}-${previewFile.path}`} text={diff.text} staged={false} truncated={diff.truncated} revisions={{ before: diff.beforeRevision?.slice(0, 8) ?? t("Empty tree"), after: diff.afterRevision.slice(0, 8) }} />}
            </div>
          </> : <>{filesHeading()}{renderFiles()}</>}
        </section>
      </div>

      <div className="shrink-0 border-t px-4 py-2 text-[11px] text-muted-foreground">
        {t("Push sends the listed commits to the tracked branch. Uncommitted changes stay on this machine and are not included.")}</div>
    </div>
  );
}
