import { useEffect, useRef, useState } from "react";
import { FolderGit2, LoaderCircle } from "lucide-react";
import { native, type RepositorySetupRequest } from "@/lib/native";
import { t, useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function RepositorySetup({workspaceId, workspacePath, blocked = false, onBusyChange = () => {}, onChanged = () => {}}: {
  workspaceId: string; workspacePath: string; blocked?: boolean; onBusyChange?: (busy: boolean) => void; onChanged?: () => void;
}) {
  const {direction} = useLanguage();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [request, setRequest] = useState<RepositorySetupRequest>({action: "clone", folder: "", url: "", initialBranch: "main"});
  const [review, setReview] = useState<RepositorySetupRequest | null>(null);
  const guard = useRef(false); const identity = `${workspaceId}\0${workspacePath}`;
  const active = useRef(identity); active.current = identity;
  useEffect(() => { setOpen(false); setReview(null); setError(""); setRequest({action:"clone",folder:"",url:"",initialBranch:"main"}); }, [identity]);
  const destination = `${workspacePath.replace(/[\\/]$/, "")}/${(review || request).folder}`;
  const valid = !!request.folder.trim() && (request.action === "clone" ? !!request.url.trim() : !!request.initialBranch.trim());
  async function execute() {
    if (!review || blocked || guard.current) return;
    guard.current = true; setBusy(true); onBusyChange(true); setError("");
    try { await native.setupRepository(workspaceId, review); if (identity === active.current) { setOpen(false); setReview(null); onChanged(); } }
    catch (e) { if (identity === active.current) { setError(String(e)); setReview(null); } }
    finally { guard.current = false; setBusy(false); onBusyChange(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (busy) return; setOpen(value); setReview(null); setError(""); }}>
    <DialogTrigger asChild><Button variant="outline" size="sm" disabled={blocked || busy}><FolderGit2 className="size-3.5" />{t("Add repository")}</Button></DialogTrigger>
    <DialogContent dir={direction} showCloseButton={!busy} className="sm:max-w-xl"><DialogHeader><DialogTitle>{t("Add repository")}</DialogTitle><DialogDescription>{t("Clone into a new folder or initialize an existing project inside this workspace.")}</DialogDescription></DialogHeader>
      {error && <Alert role="alert" variant="destructive"><AlertDescription>{t(error)}</AlertDescription></Alert>}
      {!review ? <div className="space-y-4">
        <div className="space-y-2"><label>{t("Setup method")}</label><Select value={request.action} onValueChange={action => setRequest({...request, action})} disabled={busy || blocked}><SelectTrigger aria-label={t("Setup method")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="clone">{t("Clone repository")}</SelectItem><SelectItem value="init">{t("Initialize repository")}</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><label htmlFor="setup-folder">{t("Project folder name")}</label><Input id="setup-folder" dir="ltr" autoFocus value={request.folder} disabled={busy || blocked} maxLength={255} placeholder="my-project" onChange={e => setRequest({...request, folder: e.target.value})} /><p className="text-muted-foreground">{request.action === "clone" ? t("The destination must be a new folder. Existing folders are never overwritten.") : t("Use the name of an existing direct child folder. Its files will be preserved.")}</p></div>
        {request.action === "clone" ? <div className="space-y-2"><label htmlFor="setup-url">{t("Repository URL")}</label><Input id="setup-url" dir="ltr" value={request.url} disabled={busy || blocked} autoComplete="off" spellCheck={false} maxLength={4096} onChange={e => setRequest({...request, url: e.target.value})} placeholder="https://git.example.com/team/project.git" /><p className="text-muted-foreground">{t("Use a repository URL without passwords, tokens, query parameters, or fragments. Sign in using the credential manager.")}</p></div> : <div className="space-y-2"><label htmlFor="setup-branch">{t("Initial branch")}</label><Input id="setup-branch" dir="ltr" value={request.initialBranch} disabled={busy || blocked} maxLength={255} onChange={e => setRequest({...request, initialBranch: e.target.value})} /></div>}
        <p className="text-muted-foreground break-all font-mono" dir="ltr">{destination}</p>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>{t("Cancel")}</Button><Button disabled={blocked || !valid} onClick={() => {setError(""); setReview({...request});}}>{t("Review repository setup")}</Button></div>
      </div> : <div className="space-y-4">
        <p className="font-medium">{t(review.action === "clone" ? "Clone repository" : "Initialize repository")}</p>
        <dl className="border rounded-lg p-3 space-y-3"><div><dt className="text-muted-foreground text-xs">{t("Destination")}</dt><dd dir="ltr" className="break-all font-mono text-sm">{destination}</dd></div>{review.action === "clone" ? <div><dt className="text-muted-foreground text-xs">{t("Repository URL")}</dt><dd dir="ltr" className="break-all font-mono text-sm">{review.url}</dd></div> : <div><dt className="text-muted-foreground text-xs">{t("Initial branch")}</dt><dd dir="ltr" className="font-mono">{review.initialBranch}</dd></div>}</dl>
        <p className="text-muted-foreground text-sm">{review.action === "clone" ? t("Clone may take up to two minutes. If it fails, inspect any remaining destination folder before retrying.") : t("Initialize Git without creating a commit or changing existing project files.")}</p>
        {busy && <p role="status" className="text-sm flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />{t("Setting up repository…")}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>{t("Back")}</Button><Button disabled={busy || blocked} onClick={() => void execute()}>{busy && <LoaderCircle className="size-4 animate-spin" />}{t(review.action === "clone" ? "Clone repository" : "Initialize repository")}</Button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}
