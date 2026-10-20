# GitOrbit: next-stage investigation

Date: 2026-10-17. Baseline: **0.7.2**, commit **e66022b2fe6508e8c791393fcca0dc7cb7a96b01**. A fresh `git ls-remote` confirmed that origin/main points to this commit. This is an investigation and proposed delivery sequence, not an implementation or release record.

## Scope and evidence

- Read the current source, including monitoring, command execution, repository tabs, comparison, conflicts, history, identity, saved work and batch operations. The four corrections delivered in 0.7.2 are present; they are not repeated here as missing features.
- Reopened the installed **PhpStorm 2025.3** Git plugin through **REA 6.3.0**. The JAR is 13,797,586 bytes; its freshly checked SHA-256 is `72d7ce8b5e63d31b7c2832e5e24741f2c881332d91357a3e309dab4ebc71a553`.
- Fresh REA `extract_artifact` evidence: **ev_fe2c1addc6ff385bab3cc4c0d4f521ae530d7e87dfc0fcacaa47afec90e3c252**. It materialized 2,717 regular files with verified containment. The session was closed after inspection.
- A bounded class-file parser inspected five newly selected main classes and three supporting inner classes. It records instruction boundaries, direct invocation targets, field references, literals and file hashes. It does not execute target bytecode, recover original source, resolve all virtual dispatch, or establish runtime UI behavior.
- Checked current primary JetBrains and Gitea documentation. JetBrains help identifies itself as **2026.2**; this is separate from the installed 2025.3 artifact. Current documentation is not evidence that a feature exists in that installed binary.
- Local raw evidence is retained under ignored `.dev/audit-2026-10-17/`: `rea-evidence.json`, `fresh-class-calls.json`, and `fresh-support-calls.json`. No proprietary implementation was copied into product code.
- No application server, test suite, production Git mutation, native GUI, private Gitea account or performance benchmark was run. Existing screenshots and old tests were not treated as fresh runtime evidence. Only this report and its index link change tracked files.

## Most important new finding: refresh work needs a budget

The current monitor already debounces events (750 ms), enforces a three-second minimum refresh interval and performs a 60-second safety scan (`src/lib/use-monitor.ts:4-6,88-114`). It also limits simultaneous workspace scans. This is not an uncontrolled polling loop.

However, several source-established paths still repeat work:

1. Native events emit a workspace ID rather than the affected repository (`src-tauri/src/lib.rs:79-85`). Scanning discovers repositories again and obtains status for all of them (`src-tauri/src/git.rs:385-416`).
2. Every successful scan increments the workspace revision even if no relevant detail changed (`src/lib/use-monitor.ts:55-56`).
3. Visited tabs remain mounted to preserve drafts and receive the same detail revision (`src/App.tsx:875-878`). Hidden Version Control, history and branch views can consequently reload together.
4. Version Control reloads commit options (`src/components/version-control.tsx:94`), whose backend calls the full tools inspector (`src-tauri/src/commit_options.rs:45-47`). Branches independently calls that inspector (`src/components/git-tools.tsx:110`). The inspector computes binary working/index diffs and reads complete changed files to construct a mutation review token (`src-tauri/src/git_tools.rs:38-68`). This is appropriate for validating a reviewed write, but expensive as a routine display query.
5. Turning Live off removes frontend listeners/timers (`src/lib/use-monitor.ts:82-135`); the native recursive watcher remains registered (`src-tauri/src/lib.rs:70-97`). Ignoring an event after delivery does not exclude its directory from watcher registration.

**Inference:** editing one repository can trigger unnecessary detail reads for another selected repository in the same workspace, including hidden tabs and repeated content hashing. Actual CPU, memory, I/O and frame-time impact remains unmeasured. This audit does not attribute the earlier machine resource pressure to this path alone.

**Recommended change:** emit repository-scoped invalidation; cache discovery; distinguish worktree/index/HEAD/refs/config changes; share identical in-flight reads; pause hidden-tab reads without unmounting drafts; separate lightweight display state from exact mutation snapshots. Add a native low-power/pause lifecycle. Keep stale-state and path validation before writes.

**Acceptance:** instrument Git spawn counts and bytes read, then measure idle, a save burst, a large changed media file and representative multi-repository workspaces. Unrelated saves must not reload graph/refs/signing, and an unchanged safety scan must not rebuild expensive review snapshots. Preserve draft and selection regressions. Choose numeric budgets from these baselines rather than inventing a performance claim.

## Fresh packaged-reference findings

| Shipped class | Observed direct path/state | Product implication and boundary |
| --- | --- | --- |
| `git4idea/annotate/GitFileAnnotation` with previous-revision and line-details providers | Tooltip construction includes revision and commit message; previous-revision lookup uses per-line previous revision and a revision map; line-details loading reads before/after revisions and calls `createDetailsFor` with the original line number. | Build **line → introducing change → previous version** navigation. This proves packaged navigation/data paths, not the appearance of runtime controls. |
| `git4idea/history/GitDiffFromHistoryHandler` | `getChangesBetweenRevisions` selects working-directory comparison or `GitChangeUtils.getDiff`; `showDiffForOne` reads parents and routes merge commits through parent-revision handling. | Let users select two file revisions, compare with working content and select a merge parent. GitOrbit already has history/blame; it needs a connected investigation path. |
| `git4idea/checkin/GitUserNameCheckinHandler` with `setUserNameUnderProgress$2` | `runGitCheck` uses commit context/selected roots/defined names; the setter reaches `GitConfigUtil.setValue` for `user.name` and `user.email`, with an explicit local/global choice and `--global` on the global path. | Offer **identity setup at the failed/first commit**, with repository scope by default and clear scope review. This is evidence of pre-commit identity setup, not a complete identity-profile manager. |
| `git4idea/stash/GitStashChangesSaver` | Save checks command success and whether anything was stashed, resolves the stash object and records it by root; load invokes unstash with a conflict resolver, with a `pop --index` path. | Show saved work as part of the parent operation, especially incomplete restoration. GitOrbit smart checkout already saves/reapplies work (`git_tools.rs:156-171`); expose the associated snapshot and next recovery step. This reference class does not prove partial stash. |
| `git4idea/branch/GitBranchOperation` | Separate successful/skipped/remaining repository state; fatal errors consider previous success and offer reviewed rollback; collision detection intersects working-tree changes with branch paths. | A future batch branch operation needs a per-repository result ledger, collision preview and deliberate recovery for partial success. Abstract `execute`/`rollback` bodies here do not prove atomicity or successful rollback. |

Main class hashes, in the table's order:

```text
cd027ca6f6993d053c8cddaa2a332b423e25783ceae67b83f0ec7901d028b530
680e2632af779bfd9236f1215043cde37de256d122a25e9f6f59d90cf161a0ac
fa98949594c4c6275c312d3ebbc98f13aa0bc42ee9941077507e98d81875bee7
743234b3ecbc9d10ecd1d993fe41b05400a4139f52deee1cbdde72409249fbca
528acab2689dcdfb8d7def5f3b4e409e31b7dece14253a048e36d8c7b83aaacc
```

Supporting-class hashes and method-level references are in `fresh-support-calls.json`. These are bounded static findings, not a complete decompilation of PhpStorm's Git subsystem.

## Prioritized product work

| Order | Work | Current state and useful increment | Completion evidence to require |
| --- | --- | --- | --- |
| 1 | Resource-aware monitoring and reads | Implement the refresh changes above before adding more background integrations. | Measured spawn/I/O/idle budgets plus unchanged draft and stale-review safeguards. |
| 2 | Chunk-based conflict resolution | The current editor uses full-file base/ours/theirs textareas and a result area; Use this version replaces the entire result (`src/components/conflict-editor.tsx:41-43`). Add next/previous conflict, accept left/right/both, remaining count, undo choice, actual branch labels and external editor handoff. | Temporary real-Git merge/rebase/stash conflicts, add/delete and binary/large-file fallback; never mark a conflict resolved just because a pane opened. |
| 3 | One diff workbench | Keep existing word highlights, synchronized scroll and partial staging. Add find, next/previous change, wrap, whitespace display and optional unified mode. Put hunk/line staging in the current review instead of a separate dialog. Add explicitly labeled tip-to-tip, merge-base and working-tree comparison modes. | Multi-file/rename/media cases plus correct source revisions; whitespace filtering must not silently alter staging semantics. |
| 4 | Operation center and selected-repository plans | Pull all/retry unfinished already exist. Add repository selection, preflight, per-repository phases, bounded global concurrency, duration and cancellation of child process groups. Ordinary capture currently kills its direct child (`git.rs:121-159`), while authentication has a process-group path (`auth.rs:118-130`). | Partial success, cancellation, failed auth/hooks/network, explicit stopped phase and retained results. No implied cross-repository transaction. |
| 5 | Gitea driver linked to the pushed commit | No hosting-provider driver exists in the searched product source. Start read-only: remote mapping, account capability discovery, exact full-SHA run/job/step status and relevant logs/link. Keep provider authentication separate from Git credentials and use OS credential storage. | Probe the actual server version and permissions; demonstrate the pipeline for the exact reviewed/pushed commit, not merely the latest branch run. Adaptive polling/backoff and hidden-tab pause are required. |
| 6 | Worktree management plus editor handoff | Existing linked repositories are recognized, but creation/list/removal is absent in the searched command surface. Add branch/location selection, existing worktrees, dirty checks and reviewed removal. Watch shared git-dir/common-dir changes outside the worktree root. | Two linked worktrees, external shared refs, no nested-path collision or loss of dirty content. Current 2026.2 JetBrains docs describe a single-repository worktree scope; this does not establish it in the installed 2025.3 JAR. |

Two smaller improvements can ship within the review work: identity setup at commit time and blame-to-change/previous-version navigation. Also classify signing/hook failures explicitly; the current error classifier leaves these in its generic path (`src/lib/git-errors.ts:12`). A persistent per-repository identity setting is different from the existing per-commit author/signing override.

## Simpler user flow

The target journey should be: **find repositories needing attention → review changes → resolve/stage → commit → review push → follow the same commit's CI → recover in context**.

- Keep the current four top-level destinations and Graph last. Do not add a permanent tab for every tool.
- Fix the tool title/breadcrumb when Tags, Remotes or Stashes opens inside the content currently labeled Branches (`src/App.tsx:864,874-878`). Use contextual heading/back navigation rather than another permanent tab.
- Keep Shelf and Stash; explain their different storage briefly through one Saved work entry. Neither is redundant merely because both save work.
- Keep reset, arbitrary-revision actions, remote deletion, signing details and other infrequent settings behind contextual/advanced menus. Preserve review tokens, recovery refs and ff-only defaults.
- A broader pull policy may later offer reviewed merge/rebase/save-work choices. Rebase already exists; ordinary pull is currently ff-only (`version_control.rs:666`) and divergence recovery uses merge (`sync.rs:69`).

Defer an embedded general-purpose terminal, full IDE/editor, automatic force-push or auto-stash, a heavy task/changelist manager, an unrelated CI dashboard, more themes and generic AI features. They add breadth before these daily workflows and resource costs are under control.

## Recommended delivery sequence

1. **Reliability:** measured resource baseline, incremental invalidation, lightweight reads, hidden-tab/native watcher lifecycle and operation cancellation.
2. **Review:** conflict chunks, a shared diff workbench, blame/revision navigation and identity setup in context.
3. **Connected workspace:** selected-repository operation plans, then a read-only Gitea adapter, then worktree management.

The product distinction is a multi-repository control surface that follows local work through a known commit to its pipeline result. This is a design recommendation, not a claim of market validation or complete PhpStorm parity. No time estimate is justified without benchmarking and the actual Gitea capability probe.

## Question ledger and remaining unknowns

| Question | Result |
| --- | --- |
| What is already shipped, rather than missing? | Answered from current source and verified commit identity. |
| What additional behavior is established by the reference artifact? | Partially answered through five main and three supporting classes; dynamic behavior and the rest of the plugin remain unexamined. |
| Which additions improve daily work most? | Prioritized design inference tied to the source gaps above. |
| What is unnecessarily complex? | Source-established placement problems and proposed simplifications; no fresh visual/accessibility audit is claimed. |
| How much CPU/RAM/latency will the refresh changes save? | Unresolved; instrumented runtime benchmarks are required. |
| Which Actions endpoints work on the private Gitea instance? | Unresolved; authenticated server capability probing is required. |

## Primary references checked on 2026-10-17

- [PhpStorm conflict resolution](https://www.jetbrains.com/help/phpstorm/resolve-conflicts.html): chunk actions and result editing corroborate the proposed conflict workflow.
- [PhpStorm diff viewer workflow](https://www.jetbrains.com/help/phpstorm/comparing-file-versions.html): change navigation and whitespace display corroborate review controls.
- [PhpStorm worktrees](https://www.jetbrains.com/help/phpstorm/use-git-worktrees.html): current documented management workflow and single-repository limitation.
- [Gitea 1.26 repository Actions jobs](https://docs.gitea.com/api/1.26/operations/list-workflow-jobs/): job status, conclusion, steps and `head_sha` fields. Documentation availability does not establish support on the user's private server.
