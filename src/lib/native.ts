import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

export interface Workspace {
  id: string;
  name: string;
  path: string;
  autoFetch: boolean;
}
export interface ChangedFile {
  path: string;
  originalPath: string | null;
  status: string;
}
export interface Repository {
  path: string;
  name: string;
  branch: string;
  upstream: string | null;
  changed: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
  ahead: number | null;
  behind: number | null;
  detached: boolean;
  files: ChangedFile[];
  error: string | null;
  fetchError: string | null;
}
export interface Snapshot {
  workspaceId: string;
  repositories: Repository[];
  scannedAt: number;
  fetchedAt: number | null;
  diagnostics: string[];
}
export interface Environment {
  platform: string;
  gitVersion: string | null;
  gitPath: string | null;
  installer: {
    available: boolean;
    description: string;
    command: string;
    downloadUrl: string;
    systemPrompt: boolean;
  };
}
export const native = {
  available: isTauri,
  environment: () => invoke<Environment>("check_environment"),
  load: () => invoke<Workspace[]>("load_workspaces"),
  save: (workspaces: Workspace[]) =>
    invoke<string | null>("save_workspaces", { workspaces }),
  scan: (workspaceId: string, fetch: boolean) =>
    invoke<Snapshot>("scan_workspace", { workspaceId, fetch }),
  chooseFolders: () =>
    open({ directory: true, multiple: true, title: "Add workspaces" }),
  onChange: (callback: (id: string) => void) =>
    listen<string>("workspace-invalidated", (e) => callback(e.payload)),
  installGit: () => invoke<string>("install_git"),
  downloadGit: () => invoke<void>("open_git_download"),
  openRepository: (workspaceId: string, path: string) =>
    invoke<void>("open_repository", { workspaceId, path }),
};

export function attention(r: Repository) {
  return Boolean(
    r.error ||
    r.fetchError ||
    r.conflicts ||
    r.changed ||
    r.ahead ||
    r.behind ||
    r.detached ||
    !r.upstream ||
    r.ahead === null ||
    r.behind === null,
  );
}
export function nextStep(r: Repository): {
  label: string;
  tone: "red" | "amber" | "blue" | "green" | "neutral";
} {
  if (r.error) return { label: "Check Git", tone: "red" };
  if (r.conflicts) return { label: "Resolve", tone: "red" };
  if (r.fetchError) return { label: "Retry fetch", tone: "red" };
  if (r.detached) return { label: "Select branch", tone: "amber" };
  if (r.ahead && r.behind) return { label: "Sync branch", tone: "amber" };
  if (r.changed) return { label: "Commit", tone: "amber" };
  if (r.behind) return { label: "Pull", tone: "blue" };
  if (r.ahead) return { label: "Push", tone: "blue" };
  if (!r.upstream) return { label: "Set upstream", tone: "neutral" };
  if (r.ahead === null || r.behind === null)
    return { label: "Check upstream", tone: "neutral" };
  return { label: "Clean", tone: "green" };
}
