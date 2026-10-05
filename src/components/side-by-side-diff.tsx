import { t } from "@/lib/i18n";
import { Fragment, useEffect, useRef } from "react";

type DiffLine = { number: number; text: string };

type DiffRow =
  | { kind: "context"; oldLine: DiffLine; newLine: DiffLine }
  | {
      kind: "change";
      oldLine: DiffLine | null;
      newLine: DiffLine | null;
    }
  | { kind: "hunk"; text: string }
  | { kind: "meta"; text: string };

function parseDiff(text: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNumber = 1;
  let newNumber = 1;
  let insideHunk = false;
  let removed: DiffLine[] = [];
  let added: DiffLine[] = [];

  const flushChanges = () => {
    const count = Math.max(removed.length, added.length);
    for (let index = 0; index < count; index++) {
      rows.push({
        kind: "change",
        oldLine: removed[index] ?? null,
        newLine: added[index] ?? null,
      });
    }
    removed = [];
    added = [];
  };

  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine;
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (hunk) {
      flushChanges();
      insideHunk = true;
      oldNumber = Number(hunk[1]);
      newNumber = Number(hunk[2]);
      rows.push({ kind: "hunk", text: line });
      continue;
    }
    if (
      !line ||
      (!insideHunk && (
        line.startsWith("diff --git ") ||
        line.startsWith("index ") ||
        line.startsWith("--- ") ||
        line.startsWith("new file mode ") ||
        line.startsWith("deleted file mode ") ||
        line.startsWith("similarity index ") ||
        line.startsWith("rename from ") ||
        line.startsWith("rename to ")
      ))
    ) {
      continue;
    }
    if (!insideHunk && line.startsWith("+++ ")) {
      insideHunk = true;
      continue;
    }
    if (line.startsWith("\\")) continue;

    if (line.startsWith("-")) {
      removed.push({ number: oldNumber++, text: line.slice(1) });
    } else if (line.startsWith("+")) {
      added.push({ number: newNumber++, text: line.slice(1) });
    } else if (line.startsWith(" ")) {
      flushChanges();
      const content = line.slice(1);
      rows.push({
        kind: "context",
        oldLine: { number: oldNumber++, text: content },
        newLine: { number: newNumber++, text: content },
      });
    } else {
      flushChanges();
      rows.push({ kind: "meta", text: line });
    }
  }
  flushChanges();
  return rows;
}

function lineClass(kind: DiffRow["kind"], side: "old" | "new") {
  if (kind === "context" || kind === "hunk" || kind === "meta") {
    return "bg-background text-foreground/85";
  }
  return side === "old"
    ? "diff-removed"
    : "diff-added";
}

function changedRange(text: string, other: string) {
  let start = 0;
  while (start < text.length && start < other.length && text[start] === other[start]) {
    start++;
  }
  let end = text.length;
  let otherEnd = other.length;
  while (end > start && otherEnd > start && text[end - 1] === other[otherEnd - 1]) {
    end--;
    otherEnd--;
  }
  return [start, end] as const;
}

function CodeCell({
  line,
  otherLine,
  kind,
  side,
  separator = false,
}: {
  line: DiffLine | null;
  otherLine: DiffLine | null;
  kind: DiffRow["kind"];
  side: "old" | "new";
  separator?: boolean;
}) {
  const style = line ? lineClass(kind, side) : "bg-muted/10";
  let content: React.ReactNode = line?.text || " ";
  if (line && kind === "change") {
    const highlightClass = side === "old" ? "bg-red-500/30 rounded-sm" : "bg-emerald-500/30 rounded-sm";
    if (!otherLine) {
      content = line.text || " ";
    } else if (line.text !== otherLine.text) {
      const [start, end] = changedRange(line.text, otherLine.text);
      content = <>{line.text.slice(0, start)}<mark className={`${highlightClass} text-inherit`}>{line.text.slice(start, end) || " "}</mark>{line.text.slice(end)}</>;
    }
  }
  return (
    <>
      <div className={`select-none border-b border-border/40 px-2 text-end text-muted-foreground/70 ${separator ? "border-l border-border/70" : ""} ${style}`}>
        <span className="flex justify-between gap-1">
          <span>{line?.number ?? ""}</span>
          <span aria-hidden="true">{line && kind === "change" ? side === "old" ? "−" : "+" : ""}</span>
        </span>
      </div>
      <div className={`border-b border-border/40 px-3 ${separator ? "border-l border-border/70" : ""} ${style}`}>
        <code dir="ltr" className="diff-code block whitespace-pre">{content}</code>
      </div>
    </>
  );
}

export function SideBySideDiff({
  text,
  staged,
  truncated,
  newFile: explicitlyNew = false,
}: {
  text: string;
  staged: boolean;
  truncated: boolean;
  newFile?: boolean;
}) {
  const isNewFile = explicitlyNew || text.startsWith("--- /dev/null") || text.includes("\n--- /dev/null\n");
  const isDeletedFile = text.includes("\n+++ /dev/null");
  const beforeLabel = isNewFile ? "/dev/null" : staged ? "HEAD" : t("Index");
  const afterLabel = isDeletedFile ? "/dev/null" : staged ? t("Index · staged") : t("Working tree");
  const rows = parseDiff(text);
  const oldPane = useRef<HTMLDivElement>(null);
  const newPane = useRef<HTMLDivElement>(null);

  useEffect(() => {
    for (const pane of [oldPane.current, newPane.current]) {
      if (pane) {
        pane.scrollTop = 0;
        pane.scrollLeft = 0;
      }
    }
  }, [text]);

  function renderRows(side: "old" | "new") {
    return rows.map((row, index) => {
      if (row.kind === "hunk" || row.kind === "meta") {
        return (
          <div
            key={`${row.kind}-${index}`}
            className={`col-span-2 w-max min-w-full whitespace-pre border-b border-border/40 px-3 py-1 text-xs ${row.kind === "hunk" ? "bg-blue-500/10 text-blue-400" : "bg-muted/30 text-muted-foreground"}`}
          >
            {row.text}
          </div>
        );
      }

      const line = side === "old" ? row.oldLine : row.newLine;
      const otherLine = side === "old" ? row.newLine : row.oldLine;
      return (
        <Fragment key={`${row.kind}-${index}`}>
          <CodeCell line={line} otherLine={otherLine} kind={row.kind} side={side} />
        </Fragment>
      );
    });
  }

  function renderNewFileRows() {
    return rows.map((row, index) => {
      if (row.kind === "hunk" || row.kind === "meta") {
        return <div key={`${row.kind}-${index}`} className="col-span-2 w-max min-w-full whitespace-pre border-b border-border/40 bg-muted/30 px-3 py-1 text-xs text-muted-foreground">{row.text}</div>;
      }
      return <CodeCell key={`${row.kind}-${index}`} line={row.newLine ?? row.oldLine} otherLine={null} kind="change" side="new" />;
    });
  }

  return (
    <div className="h-full min-h-0 min-w-0 font-mono text-[14px] leading-6" aria-label={isNewFile ? t("New file contents") : t("Side-by-side diff")}>
      {isNewFile ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-border bg-muted px-4 py-2 font-sans text-xs font-medium text-muted-foreground shadow-sm">{t("New file ·")}{" "}{staged ? t("Index · staged") : t("Working tree")}</div>
          <div dir="ltr" className="diff-viewport min-h-0 min-w-0 flex-1 overflow-auto">
            <div className="grid w-max min-w-full grid-cols-[3.5rem_max-content]">{renderNewFileRows()}</div>
            {truncated && <p className="w-max min-w-full border-t px-3 py-2 font-sans text-xs text-amber-500">{t("Preview truncated at 512 KB.")}</p>}
          </div>
        </div>
      ) : (
        <div dir="ltr" className="grid h-full min-h-0 min-w-0 grid-cols-2 divide-x divide-border">
          <section className="flex min-h-0 min-w-0 flex-col" aria-label={t("{label} version", {label: beforeLabel})}>
            <div className="shrink-0 border-b border-border bg-muted px-3 py-2 font-sans text-xs font-medium text-muted-foreground shadow-sm">{beforeLabel}</div>
            <div
              ref={oldPane}
              dir="ltr" className="diff-viewport min-h-0 min-w-0 flex-1 overflow-auto"
              aria-label={t("{label} code", {label: beforeLabel})}
              onScroll={(event) => {
                const peer = newPane.current;
                if (peer && peer.scrollTop !== event.currentTarget.scrollTop) peer.scrollTop = event.currentTarget.scrollTop;
              }}
            >
              <div className="grid w-max min-w-full grid-cols-[3.5rem_max-content]">{renderRows("old")}</div>
              {truncated && <p className="w-max min-w-full border-t px-3 py-2 font-sans text-xs text-amber-500">{t("Preview truncated at 512 KB.")}</p>}
            </div>
          </section>
          <section className="flex min-h-0 min-w-0 flex-col" aria-label={t("{label} version", {label: afterLabel})}>
            <div className="shrink-0 border-b border-border bg-muted px-3 py-2 font-sans text-xs font-medium text-muted-foreground shadow-sm">{afterLabel}</div>
            <div
              ref={newPane}
              dir="ltr" className="diff-viewport min-h-0 min-w-0 flex-1 overflow-auto"
              aria-label={t("{label} code", {label: afterLabel})}
              onScroll={(event) => {
                const peer = oldPane.current;
                if (peer && peer.scrollTop !== event.currentTarget.scrollTop) peer.scrollTop = event.currentTarget.scrollTop;
              }}
            >
              <div className="grid w-max min-w-full grid-cols-[3.5rem_max-content]">{renderRows("new")}</div>
              {truncated && <p className="w-max min-w-full border-t px-3 py-2 font-sans text-xs text-amber-500">{t("Preview truncated at 512 KB.")}</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
