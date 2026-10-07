import { t } from "./i18n";
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
export interface GitCommit {
  hash: string;
  parents: string[];
  author: string;
  timestamp: number;
  subject: string;
}
export interface GitRef {
  hash: string;
  name: string;
  kind: "branch" | "remote" | "tag";
}
export interface GitHistory {
  commits: GitCommit[];
  refs: GitRef[];
  head: string | null;
  hasMore: boolean;
  shallow: boolean;
}
export interface OutgoingCommit {
  hash: string;
  subject: string;
  author: string;
  timestamp: number;
}
export interface Outgoing {
  head: string;
  upstreamHead: string;
  sourceBranch: string;
  remote: string;
  destinationBranch: string;
  totalCommits: number;
  hasMore: boolean;
  commits: OutgoingCommit[];
}
export interface CommitFile {
  path: string;
  originalPath: string | null;
  status: string;
}
export interface CommitDiff {
  text: string;
  truncated: boolean;
  beforeRevision: string | null;
  afterRevision: string;
}
export interface AuthenticationInfo {
  target: string;
  host: string;
  canSignIn: boolean;
  reason: string | null;
}
export interface SyncState {
  reviewToken: string;
  head: string; upstreamHead: string; sourceBranch: string; remote: string; destinationBranch: string;
  ahead: number; behind: number; dirty: number; conflicts: number;
  operation: string | null; mergeHead: string | null; blockedReason: string | null;
  incoming: OutgoingCommit[]; note: string | null;
}
export interface GitToolRef { name: string; hash: string; kind: "local" | "remote" | "tag" | "recovery"; upstream: string; current: boolean }
export interface GitToolEntry { id: string; hash: string; subject: string }
export interface GitToolsState { reviewToken: string; head: string; branch: string; operation: string | null; changed: number; conflicts: number; refs: GitToolRef[]; stashes: GitToolEntry[]; reflog: GitToolEntry[]; remotes: string[] }
export type GitToolAction = "create" | "restore-branch" | "checkout" | "rename" | "delete" | "merge" | "rebase" | "cherry-pick" | "revert" | "reset" | "undo-commit" | "upstream" | "unset-upstream" | "stash" | "stash-apply" | "stash-pop" | "stash-drop" | "rollback" | "resolve-ours" | "resolve-theirs" | "resolve-mark" | "resolve-edit" | "continue" | "abort" | "skip" | "publish" | "delete-remote" | "create-tag" | "delete-tag" | "restore-stash";
export interface GitToolRequest { action: GitToolAction; target: string; name: string; paths: string[]; mode: string; force: boolean; checkout: boolean; reviewToken: string }
export interface GitComparison { target: string; ahead: number; behind: number; diff: string; truncated: boolean }
export interface GitConflict { base: string; ours: string; theirs: string; working: string; reviewToken: string }
export const native = {
  tools: (workspaceId: string, path: string) => invoke<GitToolsState>("repository_tools", { workspaceId, path }),
  toolAction: (workspaceId: string, path: string, request: GitToolRequest) => invoke<string>("repository_tool_action", { workspaceId, path, request }),
  compare: (workspaceId: string, path: string, target: string) => invoke<GitComparison>("repository_compare", { workspaceId, path, target }),
  conflict: (workspaceId: string, path: string, file: string) => invoke<GitConflict>("repository_conflict", { workspaceId, path, file }),
  sync: (workspaceId: string, path: string, action: "inspect" | "fetch" | "integrate" | "abort", expectedHead = "", expectedUpstreamHead = "", expectedToken = "") => invoke<SyncState>("repository_sync", {workspaceId, path, action, expectedHead, expectedUpstreamHead, expectedToken}),
  available: isTauri,
  environment: () => invoke<Environment>("check_environment"),
  load: () => invoke<Workspace[]>("load_workspaces"),
  save: (workspaces: Workspace[]) =>
    invoke<string | null>("save_workspaces", { workspaces }),
  scan: (workspaceId: string, fetch: boolean) =>
    invoke<Snapshot>("scan_workspace", { workspaceId, fetch }),
  chooseFolders: () =>
    open({ directory: true, multiple: true, title: t("Add workspace") }),
  onChange: (callback: (id: string) => void) =>
    listen<string>("workspace-invalidated", (e) => callback(e.payload)),
  installGit: () => invoke<string>("install_git"),
  downloadGit: () => invoke<void>("open_git_download"),
  openRepository: (workspaceId: string, path: string) =>
    invoke<void>("open_repository", { workspaceId, path }),
  history: (workspaceId: string, path: string, limit: number, scope: "all" | "head") =>
    invoke<GitHistory>("repository_history", { workspaceId, path, limit, scope }),
  outgoing: (workspaceId: string, path: string) =>
    invoke<Outgoing>("repository_outgoing", { workspaceId, path }),
  commitFiles: (workspaceId: string, path: string, commitHash: string) =>
    invoke<CommitFile[]>("repository_commit_files", { workspaceId, path, commitHash }),
  commitDiff: (workspaceId: string, path: string, commitHash: string, file: string) =>
    invoke<CommitDiff>("repository_commit_diff", { workspaceId, path, commitHash, file }),
  push: (workspaceId: string, path: string, expectedHead: string, expectedUpstreamHead: string) =>
    invoke<string>("push_repository", { workspaceId, path, expectedHead, expectedUpstreamHead }),
  authentication: (workspaceId: string, path: string) => invoke<AuthenticationInfo>("repository_authentication", { workspaceId, path }),
  signIn: (workspaceId: string, path: string, target: string, expectedHead: string, expectedUpstreamHead: string, sessionId: string) => invoke<void>("sign_in_repository", { workspaceId, path, target, expectedHead, expectedUpstreamHead, sessionId, purpose: "push" }),
  signInFetch: (workspaceId: string, path: string, target: string, expectedHead: string, expectedUpstreamHead: string, sessionId: string) => invoke<void>("sign_in_repository", {workspaceId, path, target, expectedHead, expectedUpstreamHead, sessionId, purpose: "fetch"}),
  cancelSignIn: (workspaceId: string, path: string, sessionId: string) => invoke<void>("cancel_git_sign_in", { workspaceId, path, sessionId }),
  signInSetup: () => invoke<void>("open_git_sign_in_setup"),
  changes: (workspaceId: string, path: string) => invoke<Repository>("repository_changes", { workspaceId, path }),
  diff: (workspaceId: string, path: string, file: string, staged: boolean) => invoke<{text: string; truncated: boolean}>("repository_diff", { workspaceId, path, file, staged }),
  action: (workspaceId: string, path: string, action: "stage" | "unstage" | "commit" | "pull" | "create-branch", paths: string[] = [], message: string | null = null) => invoke<string>("repository_action", { workspaceId, path, action, paths, message }),
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
