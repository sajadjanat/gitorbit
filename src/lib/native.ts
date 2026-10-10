import { t } from "./i18n";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";

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
  media?: MediaDiff | null;
}
export interface FilePreview {path:string;kind:"image"|"pdf"|"audio"|"video"|"binary";mime:string;size:number;dataUrl:string|null;unavailable:string|null}
export interface MediaDiff {before:FilePreview|null;after:FilePreview|null}
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
export interface CommitOptionsInfo { reviewToken: string; head: string; previousMessage: string; canAmend: boolean; blockedReason: string | null; staged: number; published: boolean; signOffIdentity: string | null; defaultAuthorName?:string; defaultAuthorEmail?:string; previousAuthorName?:string; previousAuthorEmail?:string; signingEnabled?:boolean; signingKey?:string|null; signingFormat?:string }
export interface CommitOptionsRequest { reviewToken: string; message: string; amend: boolean; signOff: boolean; author?:{name:string;email:string}|null; sign?:boolean|null }
export interface FileHistoryCommit { hash: string; author: string; timestamp: number; subject: string; path: string; previousPath: string | null; status: string }
export interface FileHistory { commits: FileHistoryCommit[]; hasMore: boolean; shallow: boolean }
export interface FileBlame { revision: string; lines: { hash: string; author: string; timestamp: number; originalLine: number; line: number; path: string; text: string }[]; truncated: boolean }
export interface GitRemotesState { reviewToken: string; remotes: {name: string; fetchUrls: string[]; pushUrls: string[]; pushUrlConfigured: boolean; hasCredentials: boolean; multipleUrls: boolean}[] }
export interface GitRemoteRequest {action: string; target: string; name: string; fetchUrl: string; pushUrl: string; reviewToken: string}
export interface PartialStageHunks {reviewToken: string; hunks: string[]; unavailable: string | null}
export interface HistoryFilters {text:string;author:string;file:string;branch:string;after:string;before:string}
export interface StashPreview {reviewToken:string;hash:string;subject:string;baseRevision:string;indexRevision:string;untrackedRevision:string|null;files:(CommitFile & {area:"working"|"index"|"untracked"})[]}
export interface RebaseInfo {reviewToken:string;head:string;base:string;commits:{hash:string;subject:string;message:string}[];blockedReason:string|null;published:boolean;shallow:boolean}
export interface InteractiveRebaseRequest {reviewToken:string;base:string;steps:{hash:string;action:"pick"|"reword"|"squash"|"fixup"|"drop";message:string}[];allowPublished:boolean}
export interface RepositorySetupRequest {action:string;folder:string;url:string;initialBranch:string}
export interface RepositorySetupResult {path:string;action:string}
export interface GitTagState {reviewToken:string;tags:{name:string;objectId:string;commitId:string;annotated:boolean;subject:string}[];remotes:string[]}
export interface GitTagRemoteReview {reviewToken:string;remoteTip:string;localTip:string}
export interface GitTagRequest {action:string;tag:string;revision:string;message:string;annotated:boolean;signed:boolean;remote:string;reviewToken:string;remoteTip:string;localTip:string}
export interface IgnoreFilesInfo {reviewToken:string;target:string;patterns:string[];paths:string[]}
export interface IgnoreFilesRequest {reviewToken:string;target:string;paths:string[]}
export interface IgnoredInventory {files:string[];hasMore:boolean}
export interface PatchExport {text:string;reviewToken:string;files:string[]}
export interface PatchPreview {reviewToken:string;patchPath:string;files:string[];stat:string;summary:string;canApply:boolean;error:string|null}
export interface RevisionTree {revision:string;directory:string;entries:{name:string;path:string;kind:string;hash:string;size:number|null}[];truncated:boolean}
export interface RevisionBlob {revision:string;path:string;text:string|null;binary:boolean|null;truncated:boolean;size:number;kind:string;preview?:FilePreview|null}
export interface GitSubmodulesState {reviewToken:string;modules:{name:string;path:string;url:string;status:string;expectedHead:string;head:string;dirty:boolean;blockedReason:string|null}[];warnings:string[]}
export interface Shelf {id:string;hash:string;title:string;timestamp:number}
export interface Shelves {reviewToken:string;entries:Shelf[]}
export interface ShelfRequest {action:"save"|"apply"|"delete";id:string;reviewToken:string;paths:string[];message:string}
export const native = {
  deleteFilesReview: (workspaceId:string,path:string,paths:string[]) => invoke<{reviewToken:string;paths:string[]}>("repository_delete_files_review",{workspaceId,path,paths}),
  deleteFiles: (workspaceId:string,path:string,request:{reviewToken:string;paths:string[]}) => invoke<string>("repository_delete_files",{workspaceId,path,request}),
  shelves: (workspaceId:string,path:string)=>invoke<Shelves>("repository_shelves",{workspaceId,path}),
  shelfPreview: (workspaceId:string,path:string,id:string)=>invoke<StashPreview>("repository_shelf_preview",{workspaceId,path,id}),
  shelfDiff: (workspaceId:string,path:string,id:string,file:string,area:string)=>invoke<CommitDiff>("repository_shelf_diff",{workspaceId,path,id,file,area}),
  shelfAction: (workspaceId:string,path:string,request:ShelfRequest)=>invoke<string>("repository_shelf_action",{workspaceId,path,request}),
  revisionTree:(workspaceId:string,path:string,revision:string,directory="")=>invoke<RevisionTree>("repository_revision_tree",{workspaceId,path,revision,directory}),
  revisionBlob:(workspaceId:string,path:string,revision:string,file:string)=>invoke<RevisionBlob>("repository_revision_blob",{workspaceId,path,revision,file}),
  submodules:(workspaceId:string,path:string)=>invoke<GitSubmodulesState>("repository_submodules",{workspaceId,path}),
  updateSubmodule:(workspaceId:string,path:string,submodulePath:string,reviewToken:string)=>invoke<string>("repository_update_submodule",{workspaceId,path,submodulePath,reviewToken}),
  tags: (workspaceId:string,path:string) => invoke<GitTagState>("repository_tags", {workspaceId,path}),
  reviewTagRemote: (workspaceId:string,path:string,action:string,tag:string,remote:string) => invoke<GitTagRemoteReview>("repository_review_tag_remote", {workspaceId,path,action,tag,remote}),
  tagAction: (workspaceId:string,path:string,request:GitTagRequest) => invoke<string>("repository_tag_action", {workspaceId,path,request}),
  ignoreFilesReview: (workspaceId:string,path:string,paths:string[],target:string) => invoke<IgnoreFilesInfo>("repository_ignore_files_review", {workspaceId,path,paths,target}),
  ignoreFilesApply: (workspaceId:string,path:string,request:IgnoreFilesRequest) => invoke<string>("repository_ignore_files_apply", {workspaceId,path,request}),
  ignoredFiles: (workspaceId:string,path:string) => invoke<IgnoredInventory>("repository_ignored_files", {workspaceId,path}),
  exportPatch: (workspaceId:string,path:string,paths:string[],staged:boolean,reviewToken:string) => invoke<PatchExport>("repository_export_patch", {workspaceId,path,paths,staged,reviewToken}),
  previewPatch: (workspaceId:string,path:string,patchPath:string) => invoke<PatchPreview>("repository_preview_patch", {workspaceId,path,patchPath}),
  applyPatch: (workspaceId:string,path:string,patchPath:string,reviewToken:string) => invoke<string>("repository_apply_patch", {workspaceId,path,patchPath,reviewToken}),
  choosePatch: async () => {const selected=await open({multiple:false,filters:[{name:t("Patch files"),extensions:["patch","diff"]}]});return typeof selected === "string"?selected:null;},
  savePatch: async (text:string) => {const path=await save({defaultPath:"changes.patch",filters:[{name:t("Patch files"),extensions:["patch","diff"]}]});if(!path)return null;return invoke<string>("save_patch_file",{path,text});},
  setupRepository: (workspaceId: string, request: RepositorySetupRequest) => invoke<RepositorySetupResult>("setup_repository", {workspaceId, request}),
  interactiveRebase: (workspaceId: string, path: string, base: string) => invoke<RebaseInfo>("repository_interactive_rebase", {workspaceId, path, base}),
  startInteractiveRebase: (workspaceId: string, path: string, request: InteractiveRebaseRequest) => invoke<string>("repository_start_interactive_rebase", {workspaceId, path, request}),
  stashPreview: (workspaceId: string, path: string, stashHash: string) => invoke<StashPreview>("repository_stash_preview", {workspaceId, path, stashHash}),
  stashDiff: (workspaceId: string, path: string, stashHash: string, file: string, area: string) => invoke<CommitDiff>("repository_stash_diff", {workspaceId, path, stashHash, file, area}),
  stashSelected: (workspaceId: string, path: string, paths: string[], message: string, reviewToken: string) => invoke<string>("repository_stash_selected", {workspaceId, path, paths, message, reviewToken}),
  stashBranch: (workspaceId: string, path: string, stashHash: string, name: string, reviewToken: string) => invoke<string>("repository_stash_branch", {workspaceId, path, stashHash, name, reviewToken}),
  historyCommitFiles: (workspaceId: string, path: string, commitHash: string) => invoke<CommitFile[]>("repository_history_commit_files", {workspaceId, path, commitHash}),
  historyCommitDiff: (workspaceId: string, path: string, commitHash: string, file: string) => invoke<CommitDiff>("repository_history_commit_diff", {workspaceId, path, commitHash, file}),
  remotes: (workspaceId: string, path: string) => invoke<GitRemotesState>("repository_remotes", {workspaceId, path}),
  remoteAction: (workspaceId: string, path: string, request: GitRemoteRequest) => invoke<string>("repository_remote_action", {workspaceId, path, request}),
  partialStage: (workspaceId: string, path: string, file: string, staged: boolean) => invoke<PartialStageHunks>("repository_partial_stage", {workspaceId, path, file, staged}),
  stageHunk: (workspaceId: string, path: string, file: string, staged: boolean, index: number, reviewToken: string, lines?:number[]) => invoke<string>("repository_stage_hunk", {workspaceId, path, file, staged, index, reviewToken, lines}),
  commitOptions: (workspaceId: string, path: string) => invoke<CommitOptionsInfo>("repository_commit_options", {workspaceId, path}),
  commitReviewed: (workspaceId: string, path: string, request: CommitOptionsRequest) => invoke<string>("repository_commit_reviewed", {workspaceId, path, request}),
  fileHistory: (workspaceId: string, path: string, file: string, limit = 200) => invoke<FileHistory>("repository_file_history", {workspaceId, path, file, limit}),
  fileHistoryDiff: (workspaceId: string, path: string, file: string, commitHash: string) => invoke<CommitDiff>("repository_file_history_diff", {workspaceId, path, file, commitHash}),
  fileBlame: (workspaceId: string, path: string, file: string, revision = "HEAD") => invoke<FileBlame>("repository_file_blame", {workspaceId, path, file, revision}),
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
  history: (workspaceId: string, path: string, limit: number, scope: "all" | "head", filters?: HistoryFilters) =>
    invoke<GitHistory>("repository_history", { workspaceId, path, limit, scope, filters }),
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
  diff: (workspaceId: string, path: string, file: string, staged: boolean) => invoke<{text: string; truncated: boolean; media?:MediaDiff|null}>("repository_diff", { workspaceId, path, file, staged }),
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
