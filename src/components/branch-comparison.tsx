import { useEffect, useState } from "react";
import { native, type CommitDiff, type GitComparison } from "@/lib/native";
import { t, number } from "@/lib/i18n";
import { FileIcon } from "./file-icon";
import { SideBySideDiff } from "./side-by-side-diff";

export function BranchComparison({ workspaceId, path, comparison }: {workspaceId: string; path: string; comparison: GitComparison}) {
  const [selected, setSelected] = useState(comparison.files[0]?.path ?? "");
  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setDiff(null); setError("");
    if (selected) void native.compareDiff(workspaceId, path, comparison.head, comparison.target, selected).then(
      result => { if (!cancelled) setDiff(result); }, reason => { if (!cancelled) setError(String(reason)); },
    );
    return () => { cancelled = true; };
  }, [workspaceId, path, comparison.head, comparison.target, selected]);
  return <div className="flex flex-1 min-h-0 flex-col sm:flex-row" data-testid="branch-comparison">
    <section aria-label={t("Changed files")} className="sm:w-64 sm:shrink-0 border-e overflow-auto max-sm:max-h-40 text-xs">
      <p className="px-3 py-2 border-b text-muted-foreground">{t("Changed files")} · {number(comparison.files.length)}</p>
      {comparison.files.map(file => <button key={file.path} type="button" aria-pressed={selected === file.path} onClick={() => setSelected(file.path)} className={`flex w-full items-center gap-2 p-3 text-start hover:bg-muted/50 ${selected === file.path ? "bg-accent" : ""}`} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path}>
        <FileIcon path={file.path}/><span className="min-w-0 flex-1" dir="ltr"><span className="block truncate font-mono font-medium">{file.path.split("/").pop()}</span><span className="block truncate text-muted-foreground text-[11px]">{file.originalPath ? `${file.originalPath} → ${file.path}` : file.path.includes("/") ? file.path.slice(0,file.path.lastIndexOf("/")) : ""}</span></span><span className="text-muted-foreground shrink-0">{t(({A:"Added",D:"Deleted",R:"Renamed",M:"Modified",T:"Type changed"} as Record<string,string>)[file.status[0]] ?? file.status)}</span>
      </button>)}
    </section>
    <section className="flex flex-1 min-w-0 min-h-0 flex-col" aria-label={t("View diff")}>
      <div className="border-b px-3 py-2 text-xs font-mono truncate" dir="ltr">{selected || t("No text difference in this view.")}</div>
      {error ? <p role="alert" className="p-4 text-destructive text-xs">{t(error)}</p> : !selected ? <p className="p-4 text-muted-foreground text-xs">{t("No text difference in this view.")}</p> : !diff ? <p className="p-4 text-muted-foreground text-xs">{t("Loading diff…")}</p> : <SideBySideDiff key={selected} text={diff.text} media={diff.media} truncated={diff.truncated} staged={false} revisions={{before:comparison.head.slice(0,8),after:comparison.target.slice(0,8)}}/>}
    </section>
  </div>;
}
