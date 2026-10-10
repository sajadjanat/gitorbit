import { useEffect, useRef, useState } from "react";
import { Globe, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { native, type GitRemotesState, type GitRemoteRequest } from "@/lib/native";
import { t, useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function RemotesManager({workspaceId, path, blocked = false, onBusyChange = () => {}, onChanged = () => {}}: {
  workspaceId: string; path: string; blocked?: boolean; onBusyChange?: (busy: boolean) => void; onChanged?: () => void;
}) {
  const {direction} = useLanguage();
  const [state, setState] = useState<GitRemotesState | null>(null);
  const [pending, setPending] = useState<GitRemoteRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0); const guard = useRef(false);
  const identity = `${workspaceId}\0${path}`;
  const activeIdentity = useRef(identity); activeIdentity.current = identity;
  async function refresh() {
    const current = ++generation.current; setLoading(true);
    try { const result = await native.remotes(workspaceId, path); if (identity === activeIdentity.current && current === generation.current) setState(result); }
    catch (e) { if (identity === activeIdentity.current && current === generation.current) setError(String(e)); }
    finally { if (identity === activeIdentity.current && current === generation.current) setLoading(false); }
  }
  useEffect(() => { setState(null); setPending(null); setError(""); setNotice(""); void refresh(); return () => { generation.current++; }; }, [workspaceId, path]);
  const locked = blocked || busy || loading || !state;
  function prepare(action: GitRemoteRequest["action"], target = "") {
    if (locked || !state) return;
    const remote = state.remotes.find(r => r.name === target); setError(""); setNotice("");
    setPending({action, target, name: action === "add" ? "" : target, fetchUrl: remote?.hasCredentials ? "" : remote?.fetchUrls[0] || "", pushUrl: remote?.hasCredentials ? "" : remote?.pushUrlConfigured ? remote.pushUrls[0] || "" : "", reviewToken: state.reviewToken});
  }
  async function execute() {
    if (!pending || locked || guard.current) return;
    guard.current = true; setBusy(true); onBusyChange(true); setError("");
    try { const message = await native.remoteAction(workspaceId, path, pending); if (identity === activeIdentity.current) { setNotice(message); setPending(null); } }
    catch (e) { if (identity === activeIdentity.current) { setError(String(e)); setPending(null); } }
    finally { if (identity === activeIdentity.current) { await refresh(); onChanged(); } guard.current = false; setBusy(false); onBusyChange(false); }
  }
  const label = (action: GitRemoteRequest["action"]) => t(({add: "Add remote", edit: "Edit remote", rename: "Rename remote", remove: "Remove remote"} as Record<string, string>)[action] ?? "Remote");
  const urlForm = pending?.action === "add" || pending?.action === "edit";
  const nameForm = pending?.action === "add" || pending?.action === "rename";
  const invalid = !!pending && ((nameForm && (!pending.name.trim() || pending.action === "rename" && pending.name === pending.target)) || urlForm && !pending.fetchUrl.trim());
  return <section className="flex flex-1 min-h-0 flex-col text-xs" data-testid="remotes-manager">
    <div className="flex items-center gap-2 border-b p-3"><Globe className="size-4 text-primary" /><h3 className="font-medium">{t("Remotes")}</h3><Button variant="outline" size="sm" disabled={locked} className="ms-auto" onClick={() => prepare("add")}><Plus className="size-3.5" />{t("Add remote")}</Button><Button variant="ghost" size="sm" disabled={busy || blocked} onClick={() => { setPending(null); setError(""); void refresh(); }}>{loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{t("Refresh")}</Button></div>
    {(error || notice) && <Alert role={error ? "alert" : "status"} variant={error ? "destructive" : "default"} className="m-3 w-auto"><AlertDescription className="whitespace-pre-wrap break-words">{t(error || notice)}</AlertDescription></Alert>}
    <div className="flex-1 overflow-auto p-4 space-y-3">
      {!loading && !state?.remotes.length && <p className="text-muted-foreground py-8 text-center">{t("No remotes configured.")}</p>}
      {state?.remotes.map(remote => <div key={remote.name} className="border rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2"><bdi dir="ltr" className="font-medium me-auto">{remote.name}</bdi><Button size="sm" variant="outline" disabled={locked || remote.multipleUrls} onClick={() => prepare("edit", remote.name)}>{t("Edit remote")}</Button><Button size="sm" variant="outline" disabled={locked} onClick={() => prepare("rename", remote.name)}>{t("Rename remote")}</Button><Button size="sm" variant="outline" disabled={locked} onClick={() => prepare("remove", remote.name)}>{t("Remove remote")}</Button></div>
        <dl className="space-y-2">{([["Fetch URL", remote.fetchUrls], ["Push URL", remote.pushUrls]] as const).map(([title, urls]) => <div key={title} className="grid sm:grid-cols-[6rem_1fr] gap-1"><dt className="text-muted-foreground">{t(title)}</dt><dd className="min-w-0 space-y-1">{urls.map((url, i) => <p key={i} dir="ltr" className="font-mono break-all text-start">{url}</p>)}</dd></div>)}</dl>
        {remote.hasCredentials && <p className="text-amber-600 dark:text-amber-400">{t("Credentials hidden. Replace the URL with a clean address to edit this remote.")}</p>}
        {remote.multipleUrls && <p className="text-muted-foreground">{t("This remote has multiple URLs. Edit it using Git to preserve every destination.")}</p>}
      </div>)}
    </div>
    {pending && <Dialog open onOpenChange={open => { if (!open && !busy) setPending(null); }}><DialogContent dir={direction} showCloseButton={!busy} className="sm:max-w-lg"><DialogHeader><DialogTitle>{label(pending.action)}</DialogTitle><DialogDescription>{pending.action === "remove" ? t("Remove local remote configuration and tracking references. Repository files and branches on the server are preserved.") : pending.action === "rename" ? t("Rename this remote and preserve branch upstream connections.") : t("Configure repository addresses. No fetch or push is performed.")}</DialogDescription></DialogHeader>
      {pending.target && <p className="font-mono border rounded-md p-3" dir="ltr">{pending.target}</p>}
      {nameForm && <div className="space-y-2"><label htmlFor="remote-name">{t("Remote name")}</label><Input id="remote-name" dir="ltr" autoFocus value={pending.name} disabled={busy} maxLength={100} onChange={e => setPending({...pending, name: e.target.value})} placeholder="origin" /></div>}
      {urlForm && <><div className="space-y-2"><label htmlFor="remote-fetch-url">{t("Fetch URL")}</label><Input id="remote-fetch-url" dir="ltr" value={pending.fetchUrl} disabled={busy} maxLength={4096} autoComplete="off" spellCheck={false} onChange={e => setPending({...pending, fetchUrl: e.target.value})} placeholder="https://git.example.com/team/repository.git" /></div><div className="space-y-2"><label htmlFor="remote-push-url">{t("Push URL (optional)")}</label><Input id="remote-push-url" dir="ltr" value={pending.pushUrl} disabled={busy} maxLength={4096} autoComplete="off" spellCheck={false} onChange={e => setPending({...pending, pushUrl: e.target.value})} /><p className="text-muted-foreground">{t("Leave empty to use the fetch URL for push.")}</p></div><p className="text-muted-foreground">{t("Use a repository URL without passwords, tokens, query parameters, or fragments. Sign in using the credential manager.")}</p></>}
      <div className="flex gap-2 justify-end mt-4"><Button variant="outline" disabled={busy} onClick={() => setPending(null)}>{t("Cancel")}</Button><Button variant={pending.action === "remove" ? "destructive" : "default"} disabled={locked || invalid} onClick={() => void execute()}>{busy && <LoaderCircle className="size-4 animate-spin" />}{label(pending.action)}</Button></div>
    </DialogContent></Dialog>}
  </section>;
}
