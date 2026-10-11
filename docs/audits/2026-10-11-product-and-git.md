# GitOrbit product and Git workflow audit — 2026-10-11

Baseline: **0.7.1**, commit `c94e8f4a96575d58f6e7725bc7a49f05ea915956`.

This is an investigation and proposed backlog, not an implementation or release announcement. The goal is a dependable multi-repository Git workspace, with less navigation and a clear next step when an operation cannot finish.

## Evidence and boundaries

- Fresh source review of the checked-out baseline, including Git operations, monitoring, repository details, diff parsing, branches, and recovery.
- Fresh in-app browser inspection of the read-only documentation preview. Desktop captures use Persian, RTL, dark theme, 1360 × 900. Eight accepted screenshots are retained locally under ignored `.dev/audit-2026-10-11/`; `report.html` presents every capture and its notes. They are not committed image assets.
- Two reproduced defects: commit draft loss when switching tabs, and incorrect multi-file patch parsing. The patch check executes the existing parser in isolation; it does not mutate a repository.
- Fresh REA target binding and verified extraction of the installed PhpStorm 2025.3 Git plugin. Focused static class-file inspection followed actual invocation and field references in eight classes. See the reference investigation below.
- No real commit, push, pull, checkout, delete, or credential operation was performed during this audit. No new full frontend/native test run or performance benchmark is claimed.
- The documentation fixture uses simplified responses, sometimes reusing files across repositories. Its count/content mismatches are not evidence of a production counting defect. Its conflict-editor response is incomplete; conflict-editor findings are source-based, not a completed runtime audit.
- Native PhpStorm UI interaction, screen-reader testing, all-language/light-theme checks, and native GUI execution on macOS/Linux were not performed in this pass.

## Captured user journey

| Step | User task | Health | Fresh evidence and recommendation |
| --- | --- | --- | --- |
| 1 | Find a repository needing attention | Good foundation; action routing needs work | `01-workspace.jpg`: distinct file/push/pull totals, explicit upstream absence, search and next-action labels. The Push-labeled next-action button opens Version Control rather than Push; verified with selected-tab attributes. Keep repository-name clicks opening Version Control, but route action buttons to their relevant review. |
| 2 | Select a changed file and review before committing | Usable; draft preservation is broken | `02-changes.jpg`: distinct staged/working/unversioned groups, type logos and side-by-side diff. Checkbox selection and file preview are separate; add clearer selected-file feedback and an inline stage/unstage action. `07-draft-before.jpg` and `08-draft-after.jpg` reproduce draft loss. |
| 3 | Select a branch | Improved and reasonably simple | `03-branches.jpg`: current branch clearly marked; selecting another branch does not check it out; checkout, compare and merge are visible. Add last commit/age and tracking divergence, and move repository-wide tools out of the Branches-only entry point. |
| 4 | Compare branches | Incomplete; parser defect reproduced | `04-compare.jpg`: commit-count summary and one combined diff, with no navigable changed-file list. A two-file parser check proves headers of the second file become bogus changed lines. |
| 5 | Review an outgoing commit and its file diff | Good foundation; direction and context need polish | `05-push-diff.jpg`: file selection expands the diff and replaces the commit list, with a close control. The fixed right arrow inherits RTL flex ordering and visually points from the remote label toward the local label. Make the entire technical route LTR or mirror the icon consistently. Keep the selected commit identifiable and expose a named Back to commits action. |
| 6 | Recover from diverged branches | Guarded but fragmented | `06-sync.jpg`: incoming/outgoing counts, explicit fetch/check, and disabled integration until refreshed. Recovery lives inside Push, while Pull results do not link into it. Bring the same recovery flow to pull/fetch/batch results. |

Accessibility observations: the preview has named controls, semantic tabs, explicit groups and labels accompanying status colors. Small 10–11px path/status text and compact icon targets deserve measurement at supported native window sizes and zoom. Focus lands on the resize separator when repository details opens; prefer a meaningful heading/tab entry while retaining keyboard resizing. Complete keyboard navigation, contrast measurement and assistive-technology testing remain open; no WCAG compliance claim is made.

## Fix before adding more features

### F1 — Preserve the user's draft and view state (high)

**Reproduced:** enter `Audit draft - do not commit` in Version Control; open Branches; return to Version Control. The textarea is empty. This was repeated and captured before/after. The component stores the message in local state, and inactive tab content unmounts. Selection, preview and filters can also reset, although those additional cases were not all separately reproduced.

Sources: `src/components/version-control.tsx:50`, `src/App.tsx:829`, `src/components/ui/tabs.tsx`.

Persist a draft per repository outside tab content. Preserve selected file, diff position and filters across navigation. Restoring a draft must never imply that checked files are the staged index. Decide explicitly whether drafts should survive app restart and provide a clear discard action.

Acceptance: switch tabs, switch repositories, close/reopen details, and refresh live data without losing or mixing repository drafts. Commit success clears only the intended draft according to the existing preference.

### F2 — Make branch comparison file-aware (high)

**Reproduced in the existing parser:** a normal two-file unified patch turns `--- a/two.txt` and `+++ b/two.txt` into a changed-code row at line 2. `insideHunk` never resets at the next `diff --git` boundary. Multi-file output is sent wholesale to a viewer designed around a single file.

Sources: `src/components/side-by-side-diff.tsx:26`, `:53`, `:71`; `src/components/git-tools.tsx:199`; `src-tauri/src/git_tools.rs:269`.

Local check: `.dev/check-compare-parser.mjs`; observed output: `.dev/compare-multifile-check.json`. The result records one bogus header-as-change pair. This is a successful reproduction of a defect, not a passing product test.

Return a changed-file list and request one immutable file diff at a time. Show status, rename paths and add/delete counts. Offer explicit tip-to-tip, merge-base-to-feature and working-tree comparisons, so the user knows what the comparison means. Handle binary media through the existing preview subsystem.

Acceptance: two or more files, rename/add/delete, binary files, paths with spaces, and merge-base comparison have correct boundaries and labels.

### F3 — Keep open repository details live (high)

**Source-established:** the main monitor updates snapshots, but open details receive a revision derived from branch name, detached state and a manual counter. An external edit or new commit on the same branch need not invalidate file lists, diffs, outgoing commits or branch data.

Sources: `src/App.tsx:831`–`834`; `src/components/version-control.tsx:73`–`105`; `src/components/push-preview.tsx:131`–`153`; `src/components/git-tools.tsx:105`–`110`; `src/components/repository-history.tsx:34`–`43`.

Use repository-scoped data revisions/events with selective invalidation. Refresh data while preserving drafts, selection, scroll and conflict-result edits. Do not simply remount the full panel on every file event: that would worsen F1 and may discard unfinished conflict edits.

Acceptance: external same-branch edit/stage/commit/fetch updates all relevant open views; an editor-save burst is debounced; a user's draft remains intact.

### F4 — One error-recovery path for push, pull, fetch and batch work (high)

Authentication guidance and divergence recovery already exist in Push. Pull one/all currently collects string results and displays a report without actionable recovery links. Sync refers non-merge operations to external Git, even though Continue/Abort/Skip already exist inside GitOrbit.

Sources: `src/App.tsx:393`–`404`, `:841`–`846`; `src/components/git-sync.tsx:46`; `src/components/git-tools.tsx:166`; `src-tauri/src/git_tools.rs:90`–`96`.

Classify errors into actionable states: authentication, divergence, dirty worktree, active operation, hook failure, network and signing. Reuse the existing authentication and integration components. Show a repository-wide operation banner with conflict count, Review files, Continue, Skip where valid, and reviewed Abort. Keep successful batch results and retry only failures.

Acceptance: an auth failure or divergence reached from Pull all can be resolved without searching another tab or rerunning successful repositories. Do not force-push or stash automatically.

## Complete the daily workflows

| Priority | Area | Already present | Useful next increment |
| --- | --- | --- | --- |
| High | Conflict resolution | Base/ours/theirs, editable result, use whole side, stale checks, stage resolved result | Per-conflict chunk navigation, accept left/right/both, remaining count, actual branch/commit labels, undo chunk choice and an external merge-tool escape hatch. Treat rebase side semantics explicitly. |
| High/medium | Branches | Current/remote branches, search, favorites, checkout review, create, merge, rebase, upstream, deletion | Last commit/age, independent fetch freshness, ahead/behind, file-based comparison; integrate the existing smart-checkout save/restore flow at the point of need. |
| Medium | Pull policy | Ordinary ff-only pull and merge-based divergence recovery | Explicit per-repository ff-only/merge/rebase preference, with reviewed temporary save and restore when chosen. A safe default should remain clear. |
| Medium | Diff workbench | Side-by-side, word-change highlighting, synchronized scrolling, partial-stage dialog, media previews | Next/previous change, find in diff, whitespace mode, optional unified mode, wrap toggle and inline hunk stage/unstage. Later add the three-version HEAD/index/working view. Syntax highlighting should be lazy and bounded. |
| Medium | Identity | Optional per-commit author/signing override | Persistent repository identity/profile settings, signing diagnostics and a clear first-commit setup. Do not recreate a secret-key manager. |
| Medium | Deletion and recovery | Explicit deletion review, guarded paths, Git recovery refs for relevant operations | Trash where supported and a local recovery path for untracked content. Current deletion uses `fs::remove_file`; a Git ref cannot restore an untracked file. |
| Later | Shelf and task organization | Named local selected-file shelves, previews, reviewed restore, separate stash UI | Partial unshelve and optional task grouping. Do not add a full changelist subsystem before proving that users need it. |
| Later | Advanced push | Outgoing review and non-fast-forward recovery | Destination selection, push up to a selected commit, and only if needed a guarded force-with-lease review. These are separate from routine push. |

Conflict source: `src/components/conflict-editor.tsx:48`–`53`. Identity: `src-tauri/src/commit_options.rs:65`–`79`. Pull: `src-tauri/src/version_control.rs:623`–`636`, `src-tauri/src/sync.rs:67`–`71`. Deletion: `src-tauri/src/delete_files.rs:62`.

The current conflict editor is a useful foundation, but it is still several full-file textareas. The priority is helping a person resolve one conflicting block correctly, not adding more full-file replacement buttons.

## Simplify without removing useful capability

1. Keep the repository table's distinct file/push/pull counts. Make each next-action badge navigate to the matching review, with a specific accessible name. Opening the repository itself should still start in Version Control.
2. Keep four main destinations. Consider **Changes / Sync / Branches / Graph**, with incoming and outgoing work in Sync. This is a proposal, not an approved navigation change. Keep Graph last, consistent with the existing user preference.
3. Move repository-wide Shelf/Stash/Tags/Remotes/Submodules/Recovery entry points to one repository header menu. They are currently reached through Branches even when unrelated to branch management.
4. Present Shelf and Stash under an understandable Saved work entry, with a short distinction and the advanced Git stash option. They are different storage mechanisms; neither is automatically redundant.
5. Move always-visible signing-format text and uncommon options behind commit settings unless attention is required. Preserve a prominent warning when identity/signing actually blocks a commit.
6. Keep patch import/export, signed tags, reset modes, remote deletion and interactive rebase available through Advanced/context menus. They should not compete with review, stage, commit and sync.
7. Use consistent navigation for full-file diff, partial staging, file history and conflict work, preserving the selected file and draft. Reduce stacked dialogs for extended work; offer a full-width repository view for long review sessions.
8. Make technical direction explicit in RTL: code/path/revision routes should remain coherent LTR islands. In the current Push header, flex order reverses but the right-arrow icon does not. Also localize the outgoing count consistently; the captured header shows ASCII `2` beside Persian numerals elsewhere.

Source for action routing: `src/components/repository-overview-row.tsx:12`–`21`, `src/App.tsx:246`. Push direction: `src/components/push-preview.tsx:229`–`234`.

Do not simplify away recovery refs, stale-state checks, review of destructive changes, destination verification or file-path protections. Their user-facing presentation can be clearer while their safeguards remain.

## Engineering work that makes the product feel faster and more dependable

### Repository-scoped monitoring and lightweight reads

File events currently notify a workspace ID; the frontend eventually requests another workspace scan, including discovery and statuses. Separate discovery from change scanning, cache discovered repositories and map paths to repository roots. Emit incremental updates and scan only affected repositories, with periodic reconciliation as a fallback.

Sources: `src-tauri/src/lib.rs:70`–`93`; `src/lib/use-monitor.ts:86`–`101`; `src-tauri/src/git.rs:264`, `:387`.

The generic tools inspection also computes review identity from binary diffs and file content, and commit-options loading calls it. That is appropriate for validating a pending write but can be expensive just to show branch names or commit defaults. Separate lightweight display queries from precise reviewed-operation snapshots; retain execution-time validation.

Sources: `src-tauri/src/git_tools.rs:38`–`67`; `src-tauri/src/commit_options.rs:44`.

These are source-established scaling risks, not measured latency or memory regressions. Benchmark save bursts, hundreds of repositories, large untracked media and large history before choosing budgets. Use list virtualization only where measurement justifies it.

### Operation center and process lifecycle

Introduce per-repository operation queues with phase, progress, elapsed time, cancellability and retry history. Independent repositories can progress concurrently within a bounded budget. Cancelling a process does not undo Git changes already completed; the result should say exactly which phase stopped and offer appropriate recovery.

Git capture has a fixed timeout and kills the direct child; authentication already has a more complete process-group cancellation path. Align ordinary Git/SSH/hooks/LFS lifecycle handling and use operation-specific timeouts. Orphaned children were not reproduced in this pass.

Sources: `src-tauri/src/version_control.rs:7`–`10`; `src-tauri/src/git.rs:148`–`159`; `src-tauri/src/auth.rs:118`–`131`.

Track last successful fetch, last attempt and fetch error per repository. A workspace timestamp updated after attempts should not imply that every remote is fresh. Preserve the existing fetch-error indicators and augment them with precise freshness.

Source: `src-tauri/src/git.rs:442`, `src/App.tsx:770`.

## What can distinguish GitOrbit

### Provider integration, starting with Gitea

A provider interface should map local remotes to a server/repository and expose capability-based PR and CI data. Start with read-only runs/jobs/status/links, then show the pipeline associated with the pushed commit, failed stage and relevant logs in the same review flow. Match by full commit SHA and branch, rather than merely the latest run. Add GitHub/GitLab adapters without mixing provider logic into core Git commands.

Gitea's official API documents repository Actions jobs. The installed server version, enabled Actions features and permissions still need capability probing; this audit did not access a private Gitea account or assert that every endpoint exists on it. Store provider tokens through OS credential storage and offer read-only scopes first. Use conditional/adaptive polling with backoff; do not describe periodic polling as a guaranteed real-time stream.

### Multi-repository work as a first-class task

Allow selecting a set of repositories, reviewing incoming/outgoing work, running an update plan and seeing separate results with retry-failed. Add repository favorites, optional groups, recent projects and an optional attention filter. Do not imply a transaction or all-or-nothing rollback across repositories.

### Worktrees and editor handoff

Create and manage worktrees for parallel feature/hotfix work; detect existing worktrees independently of creation/removal. Pair them with Open in configured editor and file/line handoff, using PhpStorm or another existing editor for specialized work rather than embedding an entire IDE.

### Optional checks and assistance

Later, offer explicit repository checks before commit/push and optional commit summaries. Respect existing hooks, report their progress/failure and do not silently bypass them. External AI assistance should require an explicit decision about sending code. Full code inspections, language servers, automatic formatting and an unrestricted terminal are not prerequisites for the next GitOrbit release.

## Continued PhpStorm reference investigation

Installed reference remains PhpStorm **2025.3**, Git4Idea **253.28294.345**. The original plugin SHA-256 was freshly verified on opening:

`72d7ce8b5e63d31b7c2832e5e24741f2c881332d91357a3e309dab4ebc71a553`

Fresh REA operation: `extract_artifact`, evidence **`ev_a78f8079e0e48c52654d84409a97d8f21eb50c7097d13ef25ff6f28de467c9b2`**. It materialized **2,717 regular files** with containment/integrity checks. The prior inventory was reused rather than rerun. The REA target was closed after inspection.

A local class-file parser read Code attributes, instruction boundaries, direct invocation targets, field references and string constants without executing PhpStorm classes. It inspected eight classes. It does not resolve virtual dispatch, prove all control-flow outcomes, recover original source or establish runtime UX. A bundled `javap` module was unavailable; no new Java/disassembler software was installed.

| Reference path | Static observation | Implication for GitOrbit |
| --- | --- | --- |
| `GitStageCompareThreeVersionsAction` → `GitStageDiffUtilKt.compareThreeVersions` | The action calls the diff utility; the utility constructs content from HEAD, staged and local versions and sets three-side accept-action keys. | Three-version staging is a real packaged workflow beyond an action name. GitOrbit's existing partial staging is useful but not equivalent. |
| `GitPushUpToCommitAction.actionPerformed` | Calls linear-history checking, builds a push source reference and opens `VcsPushDialog`. | Push up to a selected commit is a separate reviewed workflow; defer until ordinary sync/recovery is coherent. No runtime success is claimed. |
| `GitCompareWithBranchAction.actionPerformed` | Delegates to `GitBrancher.compare` with a branch and repository list. | The entry is repository-aware; this alone does not prove every downstream multi-repository result or dialog behavior. |
| `GitUpdateOptionsPanel` / `GitUpdateOptionsPanelKt.getUpdateMethods` | Settings accessors and explicit MERGE/REBASE field references. | Update strategy deserves a visible explicit policy; GitOrbit currently has ff-only ordinary pull plus merge recovery. |
| `GitSmartOperationDialog` | Reads save-changes policy, uses stash/shelf-specific labels and returns a typed dialog choice. | Explain saving local work as part of the blocked operation, rather than making the user discover an unrelated stash/shelf screen. GitOrbit already has smart checkout primitives. |

Local raw evidence is retained in ignored `.dev/phpstorm-git-calls-20261011.json` and `.dev/phpstorm-git-flows-20261011.json`, with class-file SHA-256 values. The investigation helper is `.dev/audit-class-calls.py`. No proprietary implementation was copied into product code.

Public JetBrains documentation currently labels itself **2026.2**. It corroborates current workflow ideas, not version equivalence with the installed 2025.3 binary. Worktree UI, bisect and LFS UI in the installed reference remain unestablished by this bounded inspection. Recommendations for those features are independent product choices.

## Suggested delivery order and definition of success

| Stage | Scope | Exit criteria |
| --- | --- | --- |
| 1 — Reliability and continuity | F1 drafts, F2 file-aware compare, F3 live details, action routing and RTL route fix | Reproductions stop failing; external edits refresh details without losing drafts; action badges reach the matching review; multi-file diffs show correct boundaries. |
| 2 — Complete recovery and review | Common error states, operation banner, conflict chunks, improved branch comparison, editor handoff | A user can resolve auth/divergence/conflict and resume inside a coherent path; advanced settings stay discoverable without occupying the default flow. |
| 3 — Workspace scale | Incremental monitor, lightweight read APIs, operation center, batch selection/retry and fetch freshness | Benchmarked budgets on realistic large workspaces; safe per-repository results/cancel semantics; no false clean/fresh state. |
| 4 — Connected workspace | Gitea capability-based adapter, commit-linked CI/PR, worktree management | The exact pushed commit can be followed into its pipeline and failure logs; parallel task work does not require repeated stash/checkout. |

Do not estimate development time from this audit alone. Validate each stage on disposable real-Git repositories and representative native OS installs, with targeted regression tests, before making a release claim. The strongest next step is Stage 1, not a blanket promise of every PhpStorm option.

## References

- [Existing bounded parity investigation](../phpstorm-git-parity.md)
- [Current media preview scope](../file-previews.md)
- [PhpStorm conflict workflow — current 2026.2 documentation](https://www.jetbrains.com/help/phpstorm/resolve-conflicts.html)
- [PhpStorm commit and push — current 2026.2 documentation](https://www.jetbrains.com/help/phpstorm/commit-and-push-changes.html)
- [PhpStorm Git settings](https://www.jetbrains.com/help/phpstorm/settings-version-control-git.html)
- [Gitea repository Actions jobs API — 1.26 documentation](https://docs.gitea.com/api/1.26/operations/list-workflow-jobs/)
