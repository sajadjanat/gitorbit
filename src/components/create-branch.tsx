import { useRef, useState } from "react";
import { GitBranch, LoaderCircle } from "lucide-react";
import { t, useLanguage } from "@/lib/i18n";
import { native } from "@/lib/native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function CreateBranch({ workspaceId, path, blocked, onBusyChange, onCreated }: {
  workspaceId: string; path: string; blocked: boolean;
  onBusyChange: (busy: boolean) => void; onCreated: () => void;
}) {
  const { direction } = useLanguage();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (guard.current || blocked || !name.trim()) return;
    guard.current = true; setBusy(true); onBusyChange(true); setError("");
    try {
      await native.action(workspaceId, path, "create-branch", [], name.trim());
      setOpen(false); onCreated();
    } catch (e) { setError(String(e)); }
    finally { guard.current = false; setBusy(false); onBusyChange(false); }
  }
  return <Dialog open={open} onOpenChange={(value) => {
    if (guard.current) return;
    setOpen(value);
    if (value) { setName(""); setError(""); }
  }}>
    <DialogTrigger asChild><Button size="sm" variant="outline" disabled={blocked || busy}><GitBranch className="size-3" />{t("Create branch")}</Button></DialogTrigger>
    <DialogContent dir={direction} showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{t("Create branch")}</DialogTitle><DialogDescription>{t("Create a branch from the current HEAD and switch to it. Local changes are kept.")}</DialogDescription></DialogHeader>
      <form onSubmit={create} className="grid gap-3">
        <label htmlFor="new-branch-name">{t("Branch name")}</label>
        <Input id="new-branch-name" dir="ltr" value={name} onChange={(e) => setName(e.target.value)} placeholder="feature/my-branch" maxLength={255} disabled={busy} autoComplete="off" required />
        {error && <Alert variant="destructive" role="alert"><AlertDescription className="break-words">{t(error)}</AlertDescription></Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("Cancel")}</Button>
          <Button type="submit" disabled={busy || blocked || !name.trim()}>{busy && <LoaderCircle className="size-4 animate-spin" />}{t("Create branch")}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
