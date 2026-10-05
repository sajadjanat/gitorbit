import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { native, type CommitFile, type Outgoing, type OutgoingCommit } from "@/lib/native";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

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
      className={`w-full rounded-sm px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring ${selected ? "bg-accent" : ""}`}
    >
      <span className="block text-xs font-medium leading-5 break-words">
        {commit.subject || "(no commit message)"}
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{commit.hash.slice(0, 8)}</span>
        <span className="truncate">{commit.author}</span>
        <span className="ml-auto tabular-nums">
          {dateFormat.format(new Date(commit.timestamp * 1000))}
        </span>
      </span>
    </button>
  );
}

function FileItem({ file }: { file: CommitFile }) {
  const change = changeLabel(file.status);
  const displayPath = file.originalPath
    ? `${file.originalPath} → ${file.path}`
    : file.path;
  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-2 text-xs hover:bg-muted/30" title={displayPath}>
      <change.Icon className={`size-3.5 shrink-0 ${change.className}`} />
      <span className="min-w-0 flex-1 truncate font-mono">{displayPath}</span>
      <span className={`shrink-0 text-[10px] ${change.className}`}>{change.label}</span>
    </div>
  );
}

export function PushPreview({
  workspaceId,
  path,
  upstream,
  behind,
  onPushed,
}: {
  workspaceId: string;
  path: string;
  upstream: string | null;
  behind: number | null;
  onPushed: () => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const [outgoing, setOutgoing] = useState<Outgoing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [files, setFiles] = useState<CommitFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState("");
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOutgoing(null);
    setSelectedHash(null);
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

  const selectedCommit = outgoing?.commits.find((commit) => commit.hash === selectedHash);
  const cannotPush = !outgoing || loading || pushing || outgoing.totalCommits === 0 || !selectedHash || filesLoading || Boolean(filesError) || (behind ?? 0) > 0;

  async function push() {
    if (cannotPush || !outgoing) return;
    setPushing(true);
    setError("");
    setNotice("");
    try {
      setNotice(await native.push(workspaceId, path, outgoing.head, outgoing.upstreamHead));
      onPushed();
      setRefresh((value) => value + 1);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="push-preview">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        {outgoing ? (
          <div className="inline-flex min-w-0 items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
            <span className="truncate font-medium">{outgoing.sourceBranch}</span>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-muted-foreground">
              {outgoing.remote}:{outgoing.destinationBranch}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {upstream ? "Reading the push destination…" : "No upstream branch is configured."}
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Refresh outgoing commits"
            disabled={loading || pushing || !upstream}
            onClick={() => { setNotice(""); setRefresh((value) => value + 1); }}
          >
            <RefreshCw className="size-3.5" />Refresh
          </Button>
          <Button size="sm" disabled={cannotPush} onClick={() => void push()}>
            {pushing ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowUpFromLine className="size-3.5" />}
            {pushing ? "Pushing…" : `Push ${outgoing?.totalCommits ?? 0} commit${outgoing?.totalCommits === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>

      {error && <Alert variant="destructive" className="mx-4 mt-3 w-auto"><AlertDescription>{error}</AlertDescription></Alert>}
      {notice && <Alert className="mx-4 mt-3 w-auto"><AlertDescription className="whitespace-pre-wrap">{notice}</AlertDescription></Alert>}
      {(behind ?? 0) > 0 && <Alert className="mx-4 mt-3 w-auto"><AlertDescription>The remote has {behind} commit{behind === 1 ? "" : "s"} that are not in this branch. Fetch and pull before pushing.</AlertDescription></Alert>}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section aria-label="Outgoing commits" className="flex min-h-0 flex-col border-b md:w-[44%] md:shrink-0 md:border-b-0 md:border-r">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 text-xs">
            <span className="font-medium">Outgoing commits</span>
            <span className="text-muted-foreground tabular-nums">{loading ? "…" : outgoing?.totalCommits ?? 0}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1">
            {loading && <p className="p-4 text-xs text-muted-foreground">Reading commits…</p>}
            {!loading && outgoing?.commits.map((commit) => (
              <CommitItem
                key={commit.hash}
                commit={commit}
                selected={selectedHash === commit.hash}
                onSelect={() => setSelectedHash(commit.hash)}
              />
            ))}
            {!loading && outgoing?.totalCommits === 0 && !error && (
              <p className="p-4 text-xs text-muted-foreground">Nothing to push. This branch matches its tracked remote.</p>
            )}
            {!loading && !upstream && (
              <p className="p-4 text-xs text-muted-foreground">Set an upstream branch to see and push outgoing commits.</p>
            )}
            {!loading && outgoing?.hasMore && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">Showing the newest {outgoing.commits.length} of {outgoing.totalCommits}; Push will include all outgoing commits.</p>
            )}
          </div>
        </section>

        <section aria-label="Files in selected commit" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2 text-xs">
            <span className="truncate font-medium">{selectedCommit?.subject ?? "Changed files"}</span>
            <span className="shrink-0 text-muted-foreground">{selectedCommit?.hash.slice(0, 8) ?? ""}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {filesLoading && <p className="p-4 text-xs text-muted-foreground">Reading changed files…</p>}
            {filesError && <Alert variant="destructive" className="m-3 w-auto"><AlertDescription>{filesError}</AlertDescription></Alert>}
            {!filesLoading && !filesError && selectedCommit && !files.length && <p className="p-4 text-xs text-muted-foreground">No file changes in this commit.</p>}
            {!filesLoading && files.map((file, index) => <FileItem key={`${file.status}-${file.path}-${index}`} file={file} />)}
            {!loading && !selectedCommit && !error && upstream && outgoing?.totalCommits === 0 && <p className="p-4 text-xs text-muted-foreground">Create a commit first, then review it here before pushing.</p>}
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t px-4 py-2 text-[11px] text-muted-foreground">
        Push sends the listed commits to the tracked branch. Uncommitted changes stay on this machine and are not included.
      </div>
    </div>
  );
}
