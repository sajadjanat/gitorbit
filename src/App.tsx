import { date, number, plural, useLanguage, t } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  FolderGit2,
  FolderOpen,
  GitBranch,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitOrbitWordmark } from "@/components/git-orbit-wordmark";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  native,
  attention,
  nextStep,
  type Environment,
  type Repository,
  type Workspace,
} from "@/lib/native";
import { useMonitor } from "@/lib/use-monitor";
import { RepositoryHistory } from "@/components/repository-history";
import { PushPreview } from "@/components/push-preview";
import { VersionControl } from "@/components/version-control";
import { BranchManager, GitTools } from "@/components/git-tools";
import { AppearanceButton } from "@/components/appearance";
import { LanguagePicker } from "@/components/language-picker";
import { AppUpdates } from "@/components/app-updates";
import "./index.css";
import { version } from "../package.json";

const drawerWidthKey = "workspace-monitor-detail-drawer-width";
const defaultDrawerWidth = 76;
const minDrawerWidth = 48;
const maxDrawerWidth = 92;

function clampDrawerWidth(width: number) {
  return Math.min(maxDrawerWidth, Math.max(minDrawerWidth, width));
}

function readDrawerWidth() {
  if (typeof window === "undefined") return defaultDrawerWidth;
  const saved = window.localStorage.getItem(drawerWidthKey);
  if (saved === null) return defaultDrawerWidth;
  const parsed = Number(saved);
  return Number.isFinite(parsed) ? clampDrawerWidth(parsed) : defaultDrawerWidth;
}

const tones = {
  red: "bg-red-500/10 text-red-400 border-red-500/20",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  neutral: "bg-muted/30 text-muted-foreground border-border",
};
function Status({ repo }: { repo: Repository }) {
  const step = nextStep(repo);
  return (
    <Badge
      variant="outline"
      className={`rounded-md px-2 py-0.5 font-normal ${tones[step.tone]}`}
    >
      {t(step.label)}
    </Badge>
  );
}
function IconButton({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
function timeLabel(time: number | null | undefined) {
  return time
    ? date(new Date(time), {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : t("Not yet");
}

export default function App() {
  const { direction } = useLanguage();
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState("");
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("attention");
  const [drawerWidth, setDrawerWidth] = useState(readDrawerWidth);
  const drawerWidthRef = useRef(drawerWidth);
  const [detail, setDetail] = useState<{
    workspaceId: string;
    path: string;
  } | null>(null);
  const [pulling, setPulling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [repositoryBusy, setRepositoryBusy] = useState(false);
  const [repositoryTab, setRepositoryTab] = useState("changes");
  const pullGuard = useRef(false);
  const [pullReport, setPullReport] = useState<{ title: string; total: number; results: { name: string; status: string; message: string }[] } | null>(null);
  const [showPullReport, setShowPullReport] = useState(false);
  const desktop = native.available();
  const monitor = useMonitor(
    workspaces,
    ready && Boolean(environment?.gitVersion) && !updating,
    live,
  );
  const workspace = workspaces.find((w) => w.id === active);
  const snapshot = monitor.snapshots[active];
  const selected = detail
    ? monitor.snapshots[detail.workspaceId]?.repositories.find(
        (r) => r.path === detail.path,
      )
    : undefined;
  const repositories = [...(snapshot?.repositories ?? [])]
    .filter(
      (r) =>
        r.name.toLowerCase().includes(search.toLowerCase()) &&
        (filter !== "attention" || attention(r)),
    )
    .sort(
      (a, b) =>
        Number(attention(b)) - Number(attention(a)) ||
        a.name.localeCompare(b.name),
    );
  const needsAttention = snapshot?.repositories.filter(attention).length ?? 0;

  function updateDrawerWidth(width: number, persist = false) {
    const nextWidth = clampDrawerWidth(width);
    drawerWidthRef.current = nextWidth;
    setDrawerWidth(nextWidth);
    if (persist) localStorage.setItem(drawerWidthKey, String(nextWidth));
  }

  function startDrawerResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrawerResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateDrawerWidth((direction === "rtl" ? 1 - event.clientX / window.innerWidth : event.clientX / window.innerWidth) * 100);
  }

  function finishDrawerResize() {
    localStorage.setItem(drawerWidthKey, String(drawerWidthRef.current));
  }

  function handleDrawerResizeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    let nextWidth: number | null = null;
    if (event.key === "ArrowRight") nextWidth = drawerWidth + (direction === "rtl" ? -3 : 3);
    if (event.key === "ArrowLeft") nextWidth = drawerWidth + (direction === "rtl" ? 3 : -3);
    if (event.key === "Home") nextWidth = minDrawerWidth;
    if (event.key === "End") nextWidth = maxDrawerWidth;
    if (nextWidth === null) return;
    event.preventDefault();
    updateDrawerWidth(nextWidth, true);
  }

  function openRepositoryDetails(workspaceId: string, repo: Repository) {
    setRepositoryTab("changes");
    setDetail({
      workspaceId,
      path: repo.path,
    });
  }

  useEffect(() => {
    if (!native.available()) return;
    let cancelled = false;
    void Promise.allSettled([native.environment(), native.load()])
      .then(([env, roots]) => {
        if (cancelled) return;
        if (env.status === "fulfilled") setEnvironment(env.value);
        else setError(String(env.reason));
        if (roots.status === "rejected") {
          setError(String(roots.reason));
          return;
        }
        setWorkspaces(roots.value);
        const saved = localStorage.getItem("active-workspace");
        setActive(
          roots.value.some((w) => w.id === saved)
            ? saved!
            : (roots.value[0]?.id ?? ""),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (active) localStorage.setItem("active-workspace", active);
  }, [active]);

  async function checkGit() {
    setChecking(true);
    setError("");
    try {
      setEnvironment(await native.environment());
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }
  async function installGit() {
    setInstalling(true);
    setError("");
    setNotice("");
    try {
      setNotice(await native.installGit());
      setEnvironment(await native.environment());
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  }
  async function save(roots: Workspace[]) {
    setSaving(true);
    setError("");
    try {
      const warning = await native.save(roots);
      setWorkspaces(roots);
      setNotice(warning ?? "");
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function addWorkspaces() {
    setError("");
    try {
      const chosen = await native.chooseFolders();
      if (!chosen) return;
      const paths = Array.isArray(chosen) ? chosen : [chosen];
      const key = (p: string) =>
        environment?.platform === "windows"
          ? p.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase()
          : p.replace(/\/$/, "");
      const newRoots: Workspace[] = [];
      for (const path of paths) {
        const existing = [...workspaces, ...newRoots].find(
          (w) => key(w.path) === key(path),
        );
        if (existing) {
          setActive(existing.id);
          continue;
        }
        newRoots.push({
          id: crypto.randomUUID(),
          name:
            path
              .replace(/[\\/]+$/, "")
              .split(/[\\/]/)
              .pop() || path,
          path,
          autoFetch: false,
        });
      }
      if (newRoots.length && (await save([...workspaces, ...newRoots])))
        setActive(newRoots[newRoots.length - 1].id);
    } catch (e) {
      setError(String(e));
    }
  }
  async function closeWorkspace(id: string) {
    const roots = workspaces.filter((w) => w.id !== id);
    if (await save(roots)) {
      if (active === id) setActive(roots[0]?.id ?? "");
      if (detail?.workspaceId === id) setDetail(null);
    }
  }
  async function openRepository(id: string, path: string) {
    try {
      await native.openRepository(id, path);
    } catch (e) {
      setError(String(e));
    }
  }

  async function pullRepositories(id: string, repos: Repository[], title: string) {
    if (pullGuard.current || repositoryBusy || updating || !repos.length) return;
    pullGuard.current = true; setPulling(true); setShowPullReport(true);
    setPullReport({ title, total: repos.length, results: [] });
    try {
      for (const repo of repos) {
        let result: { name: string; status: string; message: string };
        try { result = { name: repo.name, status: "Updated", message: await native.action(id, repo.path, "pull") }; }
        catch (error) { const message = String(error); result = { name: repo.name, status: message.startsWith("Skipped:") ? "Skipped" : "Failed", message }; }
        setPullReport((old) => old ? { ...old, results: [...old.results, result] } : old);
      }
    } finally { setPulling(false); pullGuard.current = false; monitor.refresh(id); }
  }
  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="min-h-14 shrink-0 border-b flex flex-wrap items-center justify-between px-4 sm:px-6 py-2 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <h1 aria-label="GitOrbit" className="shrink-0 px-2 py-1">
              <GitOrbitWordmark />
            </h1>
            <Badge
              variant="outline"
              className="hidden lg:inline-flex text-[10px] font-normal text-muted-foreground"
            >
              {t("Local Git")}</Badge>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <AppUpdates enabled={desktop} blocked={pulling || repositoryBusy || saving || installing || Object.values(monitor.busy).some(Boolean)} onInstalling={setUpdating} />
            <LanguagePicker /><AppearanceButton />
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <span
                className={`size-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-zinc-500"}`}
              />
              {live ? t("Live") : t("Paused")}
              <Switch
                aria-label={t("Live monitoring")}
                checked={live}
                onCheckedChange={setLive}
                disabled={!environment?.gitVersion}
              />
            </label>
            <Button
              size="sm"
              onClick={() => void addWorkspaces()}
              disabled={!ready || !environment?.gitVersion || saving}
            >
              <Plus className="size-4" />
              {t("Add workspace")}</Button>
          </div>
        </header>

        {(error || notice) && (
          <div className="px-6 pt-4">
            <Alert
              variant={error ? "destructive" : "default"}
              className="relative pe-10"
            >
              <AlertTitle>
                {error ? t("Something needs attention") : t("Notice")}
              </AlertTitle>
              <AlertDescription className="break-words whitespace-pre-wrap">
                {t(error || notice)}
              </AlertDescription>
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute end-2 top-2"
                aria-label={t("Dismiss message")}
                onClick={() => {
                  setError("");
                  setNotice("");
                }}
              >
                <X />
              </Button>
            </Alert>
          </div>
        )}

        {!desktop ? (
          <Empty
            title={t("Open the desktop app")}
            description={t("GitOrbit needs the desktop app to access local folders and Git.")}
            icon={<FolderGit2 />}
          />
        ) : !ready ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-64 w-full" />
            <p className="text-xs text-muted-foreground">
              {t("Checking Git and restoring workspaces…")}</p>
          </div>
        ) : !environment?.gitVersion ? (
          <div className="flex-1 flex items-center justify-center px-6 py-20">
            <div className="max-w-md w-full space-y-5">
              <span className="inline-flex size-12 items-center justify-center rounded-xl border bg-muted/30">
                <GitBranch className="size-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {t("Install Git to get started")}</h2>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {t("Git was not found on this computer. Install it once to monitor all your workspaces.")}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {t(environment?.installer.description ??
                  t("Check Git availability and try again."))}
              </p>
              {environment?.installer.command && (
                <code className="block rounded-md border bg-muted/20 p-3 text-xs break-words text-muted-foreground">
                  {environment.installer.command}
                </code>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    void (environment?.installer.available
                      ? installGit()
                      : native.downloadGit().catch((e) => setError(String(e))))
                  }
                  disabled={installing || !environment}
                >
                  {installing ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  {installing
                    ? t("Installing Git…")
                    : environment?.installer.available
                      ? t("Install Git")
                      : t("Download Git")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void checkGit()}
                  disabled={checking || installing}
                >
                  {checking && <LoaderCircle className="animate-spin" />}{t("Check again")}</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Your operating system handles any installation permissions.")}</p>
            </div>
          </div>
        ) : !workspaces.length ? (
          <Empty
            title={t("Your workspaces, at a glance")}
            description={t("Choose a folder containing your Git projects. Add more folders as tabs and monitor them together.")}
            icon={<FolderGit2 />}
          >
            <Button onClick={() => void addWorkspaces()} disabled={saving}>
              <Plus />
              {t("Add your first workspace")}</Button>
          </Empty>
        ) : (
          <Tabs
            value={active}
            onValueChange={(value) => {
              setActive(value);
              setSearch("");
            }}
            className="gap-0 flex-1"
          >
            <div className="border-b overflow-x-auto overflow-y-hidden px-6">
              <TabsList variant="line" className="h-12 gap-1 justify-start">
                {workspaces.map((w) => (
                  <div key={w.id} className="flex items-center h-full shrink-0">
                    <TabsTrigger
                      value={w.id}
                      className="h-full rounded-none px-3 gap-2"
                    >
                      <FolderOpen className="size-3.5" />
                      {w.name}
                      {Boolean(
                        monitor.snapshots[w.id]?.repositories.filter(attention)
                          .length,
                      ) && (
                        <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-400 tabular-nums">
                          {
                            number(monitor.snapshots[w.id].repositories.filter(
                              attention,
                            ).length)
                          }
                        </span>
                      )}
                    </TabsTrigger>
                    <IconButton
                      label={t("Close {name}", {name: w.name})}
                      onClick={() => void closeWorkspace(w.id)}
                      disabled={saving || pulling}
                    >
                      <X className="size-3" />
                    </IconButton>
                  </div>
                ))}
              </TabsList>
            </div>
            {workspace && (
              <TabsContent value={active} className="m-0 px-6 pt-6 pb-4">
                <div className="flex flex-wrap gap-3 items-start justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">
                      {workspace.name}
                      <span className="ms-3 font-normal text-xs text-muted-foreground">
                        {snapshot
                          ? t("{count} repositories", {count: snapshot.repositories.length})
                          : t("Scanning repositories…")}
                        {snapshot && (
                          <>
                            {" "}
                            <span className="mx-1.5">/</span>
                            <span
                              className={
                                needsAttention
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                              }
                            >
                              {monitor.errors[active] ||
                              snapshot.diagnostics.length
                                ? t("Status incomplete")
                                : needsAttention
                                  ? t("{count} need attention", {count: needsAttention})
                                  : t("All up to date")}
                            </span>
                          </>
                        )}
                      </span>
                    </h2>
                    <p dir="ltr" className="mt-1 text-xs text-muted-foreground break-all font-mono">
                      {workspace.path}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconButton
                      label={t("Refresh status")}
                      onClick={() => monitor.refresh(active)}
                      disabled={monitor.busy[active]}
                    >
                      <RefreshCw
                        className={`size-4 ${monitor.busy[active] ? "animate-spin" : ""}`}
                      />
                    </IconButton>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={monitor.busy[active] || pulling}
                      onClick={() => monitor.refresh(active, true)}
                    >
                      <ArrowDown className="size-4" />
                      {t("Fetch remotes")}</Button>
                    <Button variant="outline" size="sm" disabled={pulling || updating || !snapshot?.repositories.length} onClick={() => void pullRepositories(active, snapshot?.repositories ?? [], workspace.name)}>
                      <ArrowDown className="size-4" />{pulling ? t("Pulling…") : t("Pull all")}
                    </Button>
                    {pullReport && <Button variant="ghost" size="sm" onClick={() => setShowPullReport(true)}>{t("Pull results")}</Button>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="absolute start-2.5 top-2.5 size-3.5 text-muted-foreground" />
                      <Input
                        aria-label={t("Search repositories")}
                        placeholder={t("Find a repository…")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="ps-8 h-8 w-52 text-xs"
                      />
                    </div>
                    <Select value={filter} onValueChange={setFilter}>
                      <SelectTrigger
                        aria-label={t("Repository filter")}
                        className="h-8 w-40 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("All repositories")}</SelectItem>
                        <SelectItem value="attention">
                          {t("Needs attention")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    {t("Auto fetch")}{" "}
                    <span className="text-muted-foreground/60">{t("every 60s")}</span>
                    <Switch
                      aria-label={t("Auto fetch remotes")}
                      checked={workspace.autoFetch}
                      disabled={saving}
                      onCheckedChange={(value) =>
                        void save(
                          workspaces.map((w) =>
                            w.id === active ? { ...w, autoFetch: value } : w,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                {monitor.errors[active] && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertTitle>{t("Status unavailable")}</AlertTitle>
                    <AlertDescription>
                      {monitor.errors[active]} {t("Previous results may be outdated.")}</AlertDescription>
                  </Alert>
                )}
                {snapshot?.diagnostics.length ? (
                  <Alert className="mb-4">
                    <AlertTitle>{t("Some folders could not be scanned")}</AlertTitle>
                    <AlertDescription>
                      {snapshot.diagnostics.join("\n")}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableHead className="ps-4">{t("Repository")}</TableHead>
                        <TableHead>{t("Branch")}</TableHead>
                        <TableHead className="text-end">{t("Changes")}</TableHead>
                        <TableHead className="text-end">
                          <span className="inline-flex gap-1 items-center">
                            <ArrowUp className="size-3" />
                            {t("Push")}</span>
                        </TableHead>
                        <TableHead className="text-end">
                          <span className="inline-flex gap-1 items-center">
                            <ArrowDown className="size-3" />
                            {t("Pull")}</span>
                        </TableHead>
                        <TableHead className="ps-6">{t("Next")}</TableHead>
                        <TableHead className="w-12">
                          <span className="sr-only">{t("Open folder")}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!snapshot
                        ? Array.from({ length: 5 }, (_, i) => (
                            <TableRow key={i}>
                              {Array.from({ length: 7 }, (_, n) => (
                                <TableCell key={n}>
                                  <Skeleton className="h-4 w-full" />
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        : repositories.map((r) => (
                            <TableRow
                              key={r.path}
                              className="group cursor-pointer transition-colors duration-150 hover:bg-muted/40 motion-reduce:transition-none"
                              onClick={() => openRepositoryDetails(active, r)}
                            >
                              <TableCell className="ps-4 py-2">
                                <button
                                  type="button"
                                  className="text-start font-medium hover:underline underline-offset-4 focus-visible:outline-ring rounded-sm"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openRepositoryDetails(active, r);
                                  }}
                                >
                                  <bdi>{r.name}</bdi>
                                </button>
                                {r.error && (
                                  <span className="sr-only">
                                    {" "}
                                    {t("Status unavailable")}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs">
                                <span className="flex items-center gap-1.5">
                                  <GitBranch className="size-3 shrink-0" />
                                  <bdi>{r.detached ? t("Detached HEAD") : r.branch}</bdi>
                                </span>
                              </TableCell>
                              <TableCell
                                className={`text-end font-mono tabular-nums ${r.changed ? "text-amber-400" : "text-muted-foreground"}`}
                              >
                                {r.error ? "?" : r.changed ? number(r.changed) : "—"}
                              </TableCell>
                              <TableCell
                                className={`text-end font-mono tabular-nums ${r.ahead ? "text-blue-400" : "text-muted-foreground"}`}
                                title={
                                  r.ahead === null
                                    ? t("No tracked upstream count")
                                    : t("Commits ahead of upstream")
                                }
                              >
                                {r.ahead === null ? "?" : r.ahead ? number(r.ahead) : "—"}
                              </TableCell>
                              <TableCell
                                className={`text-end font-mono tabular-nums ${r.behind ? "text-blue-400" : "text-muted-foreground"}`}
                                title={
                                  r.behind === null
                                    ? t("No tracked upstream count")
                                    : t("Commits behind upstream")
                                }
                              >
                                {r.behind === null ? "?" : r.behind ? number(r.behind) : "—"}
                              </TableCell>
                              <TableCell className="ps-6">
                                <button
                                  type="button"
                                  aria-label={t("Details for {name}", {name: r.name})}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openRepositoryDetails(active, r);
                                  }}
                                >
                                  <Status repo={r} />
                                </button>
                              </TableCell>
                              <TableCell>
                                <IconButton
                                  label={t("Open {name} folder", {name: r.name})}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void openRepository(active, r.path)
                                  }}
                                >
                                  <FolderOpen className="size-3.5 text-muted-foreground" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                      {snapshot && !repositories.length && (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="h-40 text-center text-muted-foreground text-sm"
                          >
                            {!snapshot.repositories.length
                              ? t("No Git repositories found in this folder.")
                              : search
                                ? t("No repositories match your search.")
                                : t("All repositories are up to date.")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    {monitor.busy[active] ? (
                      <LoaderCircle className="size-3 animate-spin" />
                    ) : (
                      <Check className="size-3" />
                    )}
                    {t("Status {time}", {time: timeLabel(snapshot?.scannedAt)})}
                    <span className="mx-1">·</span>{t("Remotes {time}", {time: timeLabel(snapshot?.fetchedAt)})}
                  </span>
                  <span>
                    {t("Click a repository for its Git graph, files, or outgoing commits")}<span className="mx-1">·</span>{" "}
                    {t("? = no upstream count")}</span>
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}
        <footer className="mt-auto px-6 py-3 border-t text-[11px] text-muted-foreground flex flex-wrap justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <Activity className="size-3" />
            <span dir="ltr">v{version} ·</span>
            {plural(workspaces.length, "{count} workspace", "{count} workspaces")}
            {environment?.gitVersion && (
              <span className="ms-1">· {environment.gitVersion}</span>
            )}
          </span>
          <span>{t("Local changes live · Remote counts update on fetch")}</span>
        </footer>
        <Sheet open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }}>
          <SheetContent
            side={direction === "rtl" ? "right" : "left"}
            style={{ "--sheet-width": `${drawerWidth}vw` } as React.CSSProperties}
            className="flex flex-col gap-0 p-0 overflow-hidden"
          >
            <div
              role="separator"
              aria-label={t("Resize repository details panel")}
              aria-orientation="vertical"
              aria-valuemin={minDrawerWidth}
              aria-valuemax={maxDrawerWidth}
              aria-valuenow={Math.round(drawerWidth)}
              aria-valuetext={t("{width}% of window width", {width: Math.round(drawerWidth)})}
              tabIndex={0}
              title={t("Drag to resize · use arrow keys to adjust")}
              className="group absolute inset-y-12 end-0 z-50 hidden w-4 touch-none select-none cursor-col-resize items-center justify-center outline-none focus-visible:bg-primary/10 sm:flex"
              onPointerDown={startDrawerResize}
              onPointerMove={moveDrawerResize}
              onPointerUp={finishDrawerResize}
              onPointerCancel={finishDrawerResize}
              onLostPointerCapture={finishDrawerResize}
              onKeyDown={handleDrawerResizeKeyDown}
            >
              <span className="h-12 w-1 rounded-full bg-border transition-colors duration-150 group-hover:bg-primary group-focus-visible:bg-primary" />
            </div>
            <SheetHeader className="px-5 pt-5 pb-3 shrink-0 pe-12">
              <SheetTitle className="flex items-center gap-2"><FolderGit2 className="size-4" />{selected?.name ?? t("Repository")}</SheetTitle>
              <SheetDescription dir="ltr" className="font-mono text-[11px] truncate" title={selected?.path}>{selected?.path}</SheetDescription>
            </SheetHeader>
            {selected && detail && <>
              <div className="flex flex-wrap items-center gap-3 px-5 pb-3 shrink-0 text-xs">
                <Status repo={selected} />
                <BranchManager key={`${detail.workspaceId}:${selected.path}`} workspaceId={detail.workspaceId} path={selected.path} branch={selected.detached ? t("Detached HEAD") : selected.branch} blocked={pulling || updating || repositoryBusy || Boolean(selected.error)} onBusyChange={setRepositoryBusy} onChanged={() => monitor.refresh(detail.workspaceId)} />
                <span className="text-muted-foreground hidden sm:inline">{selected.upstream ?? t("No upstream")}</span>
                <Button variant="outline" size="sm" className="ms-auto" disabled={pulling} onClick={() => void pullRepositories(detail.workspaceId, [selected], selected.name)}><ArrowDown className="size-3.5" />{t("Pull repository")}</Button>
                <Button variant="ghost" size="sm" onClick={() => void openRepository(detail.workspaceId, selected.path)}><FolderOpen className="size-3.5" />{t("Open folder")}</Button>
              </div>
              <Tabs key={selected.path} value={repositoryTab} onValueChange={setRepositoryTab} className="flex-1 min-h-0 gap-0">
                <TabsList className="mx-5 mb-2 shrink-0 max-w-[calc(100%-2.5rem)] w-fit overflow-x-auto"><TabsTrigger value="changes">{t("Version Control")}<span className="ms-1 text-muted-foreground">{number(selected.changed)}</span></TabsTrigger><TabsTrigger value="push">{t("Push")}<span className="ms-1 text-muted-foreground">{selected.ahead === null ? "?" : number(selected.ahead)}</span></TabsTrigger><TabsTrigger value="graph">{t("Git graph")}</TabsTrigger><TabsTrigger value="tools">{t("Branches")}</TabsTrigger></TabsList>
                <TabsContent value="changes" className="m-0 flex flex-1 min-h-0 border-t"><VersionControl workspaceId={detail.workspaceId} path={selected.path} blocked={pulling || updating || repositoryBusy} onBusyChange={setRepositoryBusy} onChanged={() => monitor.refresh(detail.workspaceId)} /></TabsContent>
                <TabsContent value="push" className="m-0 flex flex-1 min-h-0 border-t"><PushPreview onReviewChanges={() => setRepositoryTab("changes")} workspaceId={detail.workspaceId} path={selected.path} upstream={selected.upstream} behind={selected.behind} blocked={pulling || updating || repositoryBusy} onBusyChange={setRepositoryBusy} onPushed={() => monitor.refresh(detail.workspaceId)} /></TabsContent>
                <TabsContent value="graph" className="m-0 flex flex-1 min-h-0 border-t"><RepositoryHistory workspaceId={detail.workspaceId} path={selected.path} blocked={pulling || updating || repositoryBusy} onBusyChange={setRepositoryBusy} onChanged={() => monitor.refresh(detail.workspaceId)} /></TabsContent>
                <TabsContent value="tools" className="m-0 flex flex-1 min-h-0 border-t"><GitTools workspaceId={detail.workspaceId} path={selected.path} blocked={pulling || updating || repositoryBusy} onBusyChange={setRepositoryBusy} onChanged={() => monitor.refresh(detail.workspaceId)} /></TabsContent>
              </Tabs>
            </>}
          </SheetContent>
        </Sheet>
        <Dialog open={showPullReport} onOpenChange={setShowPullReport}>
          <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
            <DialogHeader><DialogTitle>{pullReport ? t("Pull · {name}", {name: pullReport.title}) : t("Pull results")}</DialogTitle><DialogDescription>{t("Fast-forward updates. Repositories with local changes, no upstream, or divergent history need attention.")}</DialogDescription></DialogHeader>
            {pullReport && <>
              <p className="text-xs text-muted-foreground flex gap-2 items-center">{pulling && <LoaderCircle className="size-3 animate-spin" />}{t("{done}/{total} processed · {updated} updated · {skipped} skipped · {failed} failed", {done: pullReport.results.length, total: pullReport.total, updated: pullReport.results.filter(r => r.status === "Updated").length, skipped: pullReport.results.filter(r => r.status === "Skipped").length, failed: pullReport.results.filter(r => r.status === "Failed").length})}</p>
              <div className="overflow-auto min-h-0 rounded-md border divide-y">
                {pullReport.results.map((result, i) => <div key={i} className="p-3 text-xs"><div className="flex justify-between gap-3"><bdi className="font-medium">{result.name}</bdi><span className={result.status === "Updated" ? "text-emerald-500" : result.status === "Skipped" ? "text-amber-500" : "text-destructive"}>{t(result.status)}</span></div><p dir="auto" className="text-muted-foreground mt-1 whitespace-pre-wrap break-words">{t(result.message)}</p></div>)}
                {!pullReport.results.length && <p className="p-4 text-xs text-muted-foreground">{t("Updating repositories…")}</p>}
              </div>
            </>}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function Empty({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="max-w-sm text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-xl border bg-muted/30 [&_svg]:size-5 text-muted-foreground mb-5">
          {icon}
        </span>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-2 mb-6 leading-relaxed">
          {description}
        </p>
        {children}
      </div>
    </div>
  );
}
