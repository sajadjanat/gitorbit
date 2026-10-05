import { date, t } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { GitBranch, GitMerge, LoaderCircle, RefreshCw } from "lucide-react";
import { native, type GitHistory } from "@/lib/native";
import { edgePath, LANE_WIDTH, layoutGraph, ROW_HEIGHT } from "@/lib/git-graph";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const dateFormat = { format: (value: Date) => date(value, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) };

export function RepositoryHistory({ workspaceId, path }: { workspaceId: string; path: string }) {
  const [limit, setLimit] = useState(200);
  const [scope, setScope] = useState<"all" | "head">("all");
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<{ key: string; data?: GitHistory; loading: boolean; error?: string }>({ key: "", loading: true });
  const key = `${workspaceId}\0${path}\0${scope}`;
  useEffect(() => {
    let cancelled = false;
    setState((old) => ({ key, data: old.key === key ? old.data : undefined, loading: true }));
    void native.history(workspaceId, path, limit, scope).then(
      (data) => { if (!cancelled) setState({ key, data, loading: false }); },
      (error) => { if (!cancelled) setState((old) => ({ key, data: old.key === key ? old.data : undefined, loading: false, error: String(error) })); },
    );
    return () => { cancelled = true; };
  }, [key, workspaceId, path, limit, scope, refresh]);
  const data = state.key === key ? state.data : undefined;
  const loading = state.key !== key || state.loading;
  const graph = useMemo(() => layoutGraph(data?.commits ?? []), [data]);
  const refs = useMemo(() => {
    const result = new Map<string, GitHistory["refs"]>();
    for (const ref of data?.refs ?? []) result.set(ref.hash, [...(result.get(ref.hash) ?? []), ref]);
    return result;
  }, [data]);
  const commit = data?.commits.find((c) => c.hash === selected);
  const graphWidth = graph.width * LANE_WIDTH + 18;
  return (
    <div className="flex flex-col flex-1 min-h-0" data-testid="repository-history">
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b">
        <Select value={scope} onValueChange={(value) => { setScope(value as "all" | "head"); setLimit(200); setSelected(null); }}>
          <SelectTrigger aria-label={t("History scope")} className="w-40 h-8 text-xs"><GitBranch className="size-3.5" /><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("All branches")}</SelectItem><SelectItem value="head">{t("Current HEAD")}</SelectItem></SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{data ? t("{count} commits", {count: data.commits.length}) : t("Reading history…")}</span>
        <Button variant="ghost" size="sm" className="ms-auto" aria-label={t("Refresh history")} disabled={loading} onClick={() => setRefresh((n) => n + 1)}>
          {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} {t("Refresh")}</Button>
      </div>
      {state.key === key && state.error && <Alert variant="destructive" className="m-4 w-auto"><AlertTitle>{t("Could not read Git history")}</AlertTitle><AlertDescription>{t(state.error)}</AlertDescription></Alert>}
      {data?.shallow && <p className="px-4 py-2 text-xs text-muted-foreground border-b">{t("Shallow clone: only locally available history is shown.")}</p>}
      {!data && loading && <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> {t("Loading commit graph…")}</div>}
      {data && !data.commits.length && <div className="flex-1 grid place-items-center py-16 text-sm text-muted-foreground">{t("No commits in this history yet.")}</div>}
      {data && data.commits.length > 0 && <>
        <div className="flex-1 min-h-0 overflow-auto" aria-label={t("Git commit graph")} tabIndex={0}>
          <table className="history-table w-full table-fixed text-xs" style={{ minWidth: 760 + graphWidth }}>
            <colgroup><col style={{ width: graphWidth }} /><col /><col style={{ width: 160 }} /><col style={{ width: 148 }} /><col style={{ width: 84 }} /></colgroup>
            <thead className="sticky top-0 z-10 bg-background"><tr className="h-8 border-b text-muted-foreground text-start"><th><span className="sr-only">{t("Graph")}</span></th><th className="font-normal">{t("Commit message")}</th><th className="font-normal px-2">{t("Author")}</th><th className="font-normal px-2">{t("Date")}</th><th className="font-normal px-2">{t("Commit")}</th></tr></thead>
            <tbody>
              {data.commits.map((c, index) => {
                const row = graph.rows[index];
                const merge = c.parents.length > 1;
                return <tr key={c.hash} data-selected={selected === c.hash} className="history-row" style={{ height: ROW_HEIGHT }}>
                  <td className="p-0 align-middle"><svg aria-hidden="true" width={graphWidth} height={ROW_HEIGHT} className="block overflow-visible" data-graph-row={c.hash}>
                    {row.edges.map((edge, i) => <path key={i} d={edgePath(edge)} stroke={`var(--git-lane-${edge.color % 8})`} strokeWidth="1.5" fill="none" />)}
                    <circle cx={12 + row.lane * LANE_WIDTH} cy={ROW_HEIGHT / 2} r={merge ? 4 : 3.5} fill={`var(--git-lane-${row.color % 8})`} />
                    {merge && <circle cx={12 + row.lane * LANE_WIDTH} cy={ROW_HEIGHT / 2} r="1.8" fill="var(--background)" />}
                  </svg></td>
                  <td className="p-0"><button className="flex w-full h-7 items-center gap-2 text-start pe-3 focus-visible:outline-2 focus-visible:outline-ring rounded-sm" aria-pressed={selected === c.hash} onClick={() => setSelected(selected === c.hash ? null : c.hash)} title={c.subject || t("Untitled commit")}>
                    {data.head === c.hash && <Badge variant="outline" className="history-ref text-violet-500 shrink-0">HEAD</Badge>}
                    {(refs.get(c.hash) ?? []).map((ref) => <Badge key={`${ref.kind}-${ref.name}`} variant="outline" className={`history-ref shrink-0 max-w-40 truncate ${ref.kind === "branch" ? "text-emerald-500" : ref.kind === "remote" ? "text-blue-500" : "text-amber-500"}`} title={`${ref.kind}: ${ref.name}`}>{ref.name}</Badge>)}
                    {merge && <GitMerge aria-label={t("Merge commit")} className="size-3 shrink-0 text-muted-foreground" />}
                    <span className={`truncate ${merge ? "text-muted-foreground" : "text-foreground/90"}`}>{c.subject || t("Untitled commit")}</span>
                  </button></td>
                  <td className="px-2 truncate text-muted-foreground" title={c.author}>{c.author}</td>
                  <td className="px-2 whitespace-nowrap text-muted-foreground tabular-nums">{dateFormat.format(new Date(c.timestamp * 1000))}</td>
                  <td dir="ltr" className="px-2 font-mono text-[10px] text-muted-foreground" title={c.hash}>{c.hash.slice(0, 7)}</td>
                </tr>;
              })}
            </tbody>
          </table>
          {data.hasMore && <div className="py-3 text-center border-t"><Button variant="outline" size="sm" disabled={loading || limit >= 5000} onClick={() => setLimit((n) => Math.min(n + 200, 5000))}>{limit >= 5000 ? t("Showing the latest 5,000 commits") : loading ? t("Loading…") : t("Load 200 more commits")}</Button></div>}
        </div>
        {commit && <div className="shrink-0 border-t px-4 py-3 bg-muted/20 space-y-1 text-xs max-h-32 overflow-auto"><p className="font-medium break-words">{commit.subject}</p><p dir="ltr" className="font-mono break-all text-muted-foreground">{commit.hash}</p><p className="text-muted-foreground">{commit.author} · {dateFormat.format(new Date(commit.timestamp * 1000))}</p><p dir="ltr" className="font-mono text-[10px] break-all text-muted-foreground">{commit.parents.length ? t("Parents: {parents}", {parents: commit.parents.map(p => p.slice(0, 7)).join(" · ")}) : t("Root commit")}</p></div>}
        <div className="shrink-0 px-4 py-2 border-t text-[11px] text-muted-foreground">{t("Newest first · Lines follow commit parents · Branches and tags reflect local refs")}</div>
      </>}
    </div>
  );
}
