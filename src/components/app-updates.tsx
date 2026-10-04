import { useCallback, useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updater, type AppUpdate, type UpdateConnection } from "@/lib/updater";
import { version } from "../../package.json";

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
type Phase = "idle" | "checking" | "downloading" | "installing" | "restarting";

export function AppUpdates({ enabled, blocked, onInstalling }: { enabled: boolean; blocked: boolean; onInstalling: (value: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<AppUpdate | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [progress, setProgress] = useState({ bytes: 0, total: 0 });
  const [connection, setConnection] = useState<UpdateConnection>("system");
  const active = useRef(true);
  const busy = useRef(false);
  const heldUpdate = useRef<AppUpdate | null>(null);
  const lastAttempt = useRef(0);
  const updating = ["downloading", "installing", "restarting"].includes(phase);

  const checkNow = useCallback(async () => {
    if (!enabled || busy.current) return;
    busy.current = true; lastAttempt.current = Date.now();
    setPhase("checking"); setError("");
    try {
      const mode = await updater.connection();
      if (active.current) setConnection(mode);
      const result = await updater.check();
      if (!active.current) { await result?.close().catch(() => {}); return; }
      const old = heldUpdate.current;
      heldUpdate.current = result;
      setAvailable(result); setCheckedAt(Date.now());
      await old?.close().catch(() => {});
    } catch (e) {
      if (active.current) setError(String(e));
    } finally {
      busy.current = false;
      if (active.current) setPhase("idle");
    }
  }, [enabled]);

  useEffect(() => {
    active.current = true;
    if (enabled) void checkNow();
    const timer = enabled ? window.setInterval(() => void checkNow(), CHECK_INTERVAL) : undefined;
    const visible = () => { if (document.visibilityState === "visible" && Date.now() - lastAttempt.current >= CHECK_INTERVAL) void checkNow(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      const old = heldUpdate.current; heldUpdate.current = null;
      void old?.close().catch(() => {});
    };
  }, [enabled, checkNow]);

  async function changeConnection(mode: UpdateConnection) {
    if (busy.current || !enabled) return;
    busy.current = true; setPhase("checking"); setError("");
    let saved = false;
    try {
      await updater.saveConnection(mode); setConnection(mode);
      const old = heldUpdate.current; heldUpdate.current = null;
      setAvailable(null); setCheckedAt(null);
      await old?.close().catch(() => {}); saved = true;
    } catch (e) { setError(String(e)); }
    finally { busy.current = false; setPhase("idle"); }
    if (saved) void checkNow();
  }

  async function install() {
    const update = heldUpdate.current;
    if (!update || busy.current || blocked) return;
    busy.current = true; onInstalling(true);
    setError(""); setProgress({ bytes: 0, total: 0 }); setPhase("downloading");
    try {
      await update.download((event) => {
        if (!active.current) return;
        if (event.event === "Started") setProgress({ bytes: 0, total: event.data.contentLength ?? 0 });
        if (event.event === "Progress") setProgress((old) => ({ ...old, bytes: old.bytes + event.data.chunkLength }));
      }, { timeout: 120_000 });
      if (!active.current) return;
      setPhase("installing");
      await update.install({ restartAfterInstall: true });
      // Windows exits here and its installer restarts the app; other platforms need relaunch.
      setPhase("restarting");
      await updater.restart();
    } catch (e) {
      if (active.current) { setError(`Update failed: ${String(e)}`); setPhase("idle"); }
    } finally { busy.current = false; onInstalling(false); }
  }

  const percent = progress.total > 0 ? Math.min(100, Math.round(progress.bytes / progress.total * 100)) : null;
  return <>
    <Button variant={available ? "default" : "ghost"} size="sm" aria-label={available ? `Update available: ${available.version}` : "App updates"} onClick={() => setOpen(true)}>
      <Download className="size-3.5" /><span className="hidden sm:inline">{available ? `Update ${available.version}` : "Updates"}</span>
    </Button>
    <Dialog open={open} onOpenChange={(value) => { if (!updating) setOpen(value); }}>
      <DialogContent className="sm:max-w-md" onEscapeKeyDown={(e) => { if (updating) e.preventDefault(); }} onPointerDownOutside={(e) => { if (updating) e.preventDefault(); }}>
        <DialogHeader><DialogTitle>{available ? "Update available" : "App updates"}</DialogTitle><DialogDescription>Current version: {version}. Updates are checked at startup and every six hours.</DialogDescription></DialogHeader>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {available ? <div className="space-y-3">
          <p className="text-sm font-medium">Workspace Monitor {available.version}</p>
          {available.body && <div className="max-h-52 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground rounded-md border p-3">{available.body}</div>}
          <p className="text-xs text-muted-foreground">Download and install the signed release, then restart. Your workspaces and appearance settings are kept.</p>
          {updating && <div className="space-y-2" role="status">
            <p className="text-xs flex gap-2 items-center"><LoaderCircle className="size-3.5 animate-spin" />{phase === "downloading" ? `Downloading${percent === null ? "…" : ` ${percent}%`}` : phase === "installing" ? "Verifying and installing…" : "Restarting…"}</p>
            {phase === "downloading" && percent !== null && <div role="progressbar" aria-label="Update download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div>}
          </div>}
          {blocked && !updating && <p className="text-xs text-amber-500">Wait for the current Git operation to finish before updating.</p>}
          <Button className="w-full" disabled={blocked || phase !== "idle"} onClick={() => void install()}><Download className="size-4" />Update &amp; restart</Button>
        </div> : phase === "checking" ? <p role="status" className="text-sm text-muted-foreground">Checking for updates…</p> : !error && checkedAt ? <p className="text-sm">You are up to date.</p> : <p className="text-sm text-muted-foreground">Check for a newer release.</p>}
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>{checkedAt ? `Last checked ${new Date(checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not checked yet"}</span>
          <Button variant="outline" size="sm" disabled={!enabled || phase !== "idle"} onClick={() => void checkNow()}><RefreshCw className="size-3.5" />Check again</Button>
        </div>
        <fieldset className="border-t pt-3"><legend className="text-xs font-medium">Update connection</legend><div className="grid grid-cols-2 gap-2 mt-2">
          {(["system", "direct"] as const).map((mode) => <Button key={mode} variant={connection === mode ? "default" : "outline"} size="sm" disabled={!enabled || phase !== "idle"} aria-pressed={connection === mode} onClick={() => void changeConnection(mode)}>{mode === "system" ? "System proxy" : "Direct connection"}</Button>)}
        </div><p className="text-[11px] text-muted-foreground mt-2">Applies only to update checks and downloads.</p></fieldset>
      </DialogContent>
    </Dialog>
  </>;
}
