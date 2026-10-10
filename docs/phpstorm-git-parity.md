# PhpStorm Git workflow investigation

Investigation date: 2026-10-10. This document records the inspected artifact, the GitOrbit implementation scope, and the remaining work. It is not a claim of complete PhpStorm parity or a release announcement.

## Evidence and boundaries

The installed reference was PhpStorm **2025.3**, specifically `plugins/vcs-git/lib/vcs-git.jar`. Its `META-INF/plugin.xml` declares the `Git4Idea` plugin version **253.28294.345**.

| Evidence | Observation |
| --- | --- |
| SHA-256 | `72d7ce8b5e63d31b7c2832e5e24741f2c881332d91357a3e309dab4ebc71a553` |
| REA | `rea-agents` **6.3.0**, artifact graph provider |
| Operation | `inspect_artifact`, ZIP inventory and graph |
| Evidence ID | `ev_ee684a772fdce09529bf9dd0f6427c17565f2670e2b819f7695f1c40d5316530` |
| Archive inventory | **2,717 members**; graph **2,718 nodes** including the archive root |
| XML inventory | **111 action registrations**, **100 explicit action IDs** |
| Independent corroboration | Python `zipfile`, XML parsing, and file digest |

The local raw evidence is retained in ignored `.dev/phpstorm-git-rea.json`; the MCP handshake check is retained in `.dev/rea-mcp-verification.json`. These local files are not part of the published repository and may include machine-specific paths.

Action declarations such as `Git.Configure.Remotes`, `Git.Interactive.Rebase`, `Git.Stage.Compare.Three.Versions`, `Git.Tag.Push`, and `Git.PushUpToCommit` establish packaged entry points. Class inventory establishes the presence of components such as annotation, file-history and submodule providers. Neither proves that a particular screen was opened or that an operation ran successfully.

REA reports some embedded members as `mach-o-universal`. Java class files and universal Mach-O files share the `CAFEBABE` magic, so these format hints were not treated as evidence of native code or architecture. The root JAR/ZIP identity and its digest were independently checked.

No PhpStorm runtime interaction, Java class decompilation, or native disassembler was used for this pass. No proprietary implementation was copied. GitOrbit uses its own React/shadcn interface and invokes Git for repository operations.

The public JetBrains documentation consulted currently identifies itself as **2026.2**. It provides workflow guidance; it does not establish that every documented feature exists in the installed **2025.3** artifact. In particular, worktree UI support was not established by this JAR inventory. Git LFS and bisect UI support were also not established by this bounded inspection.

## Implemented scope

The following capabilities have code and UI in the current implementation. Validation and publication status belong to the associated work record; this table does not imply that every platform or combination has been exercised.

| Workflow | GitOrbit support | Deliberate limits |
| --- | --- | --- |
| Workspaces and status | Multiple workspace tabs, repository discovery, live refresh, unique changed-file totals including nested new files, separate push/pull commit counts and next action | Local Git must be installed; remote counts reflect the last fetch; unavailable counts are not presented as current |
| Commit | Stage/unstage whole files, commit, commit-and-push, retain message, reviewed amend/sign-off, optional custom author, per-commit signing override and saved message history/templates | Amend does not support merge commits; signing needs existing configured keys/tools; message history/templates are local to this device |
| Partial staging | Reviewed stage/unstage of a text hunk or selected changed lines | Modified UTF-8 text only; individual lines require a final newline; no editable three-version staging view |
| Diff | Side-by-side text diff with line numbers, changed text highlighting and synchronized scrolling | Large/binary or unsupported content can require external tools |
| Branches | Create from HEAD/ref/commit, local/remote checkout, rename, delete, favorites, upstream configuration, publish | Operations are per repository; no synchronous multi-repository branch transaction |
| Integration | Merge, rebase, cherry-pick, revert; continue/abort/skip where supported | Does not expose every Git command option |
| Recovery | Reflog, recovery refs, reset modes, undo commit, rollback tracked files, smart checkout | Recovery refs are not an editor-style Local History service |
| Conflicts | Base/ours/theirs inspection, merged-result text editor, accept side, stage resolved result | No visual per-conflict chunk acceptance/navigation; binary and large conflicts need external tools |
| Remotes | Reviewed add/edit/rename/remove, fetch and push URL display, credential redaction, upstream-preserving rename | Multiple URLs are displayed but URL editing is delegated to Git to preserve all destinations |
| Init and clone | Initialize an existing project folder; clone into a fresh folder in the selected workspace | Direct child folders only; no overwrite, recursive submodules or automatic deletion of partial destinations; clone timeout is two minutes |
| History | Graph, refs, metadata, pagination, message/author/path/branch/date filters, historical commit file lists and diffs | Locally available history; graph limit of 5,000 commits |
| Historical snapshots | Lazy directory browsing, immutable text/blob preview and annotations at a selected commit | No checkout or local edits; 5,000 entries per directory and 2 MiB text limit |
| Submodules | Reviewed initialization/update to the parent-recorded commit, dirty/conflict guards and child recovery refs | No forced update, remote-tracking update, deinit/removal or recursive update |
| File investigation | File history with rename-aware paths and historical diffs; blame | Bounded text/history views rather than a full IDE editor |
| Stashes | Save/apply/pop/drop, file and diff preview, selected-file stash, branch from stash, recovery | Not a changelist/shelf system |
| Shelf | Named selected-file snapshots, separate shelf list, staged/working/new-file previews, side-by-side diffs, reviewed restore and removal, recovery refs | Local to the repository; separate from Git stash and task changelists; whole saved snapshot restoration, not per-hunk unshelving; overlapping local files block restoration |
| Context menus | Repository, change-file, outgoing-file, graph-commit, branch, tag, recovery and shelf actions; keyboard and visible menu access where appropriate | Actions use the clicked item or the selected files in its group; destructive operations open existing reviews rather than executing directly |
| Interactive rebase | Review and reorder a linear commit sequence; pick/reword/squash/fixup/drop; recovery ref | At most 100 commits; clean attached non-shallow repository; no merge commits, `edit` stop, root rebase or arbitrary `exec` actions |
| Tags | Lightweight/annotated/explicitly signed creation, reviewed push and remote deletion, existing local deletion | No remote replacement; remote actions currently start from a local tag; signed tags require a working signing key/agent |
| Ignore rules | Review selected unversioned files for ignore/exclude, inspect ignored files | Does not silently untrack already tracked files |
| Patches | Export a reviewed change selection; preview/check and apply an imported patch | No per-hunk patch editor |
| Push/pull recovery | Reviewed outgoing commits and diffs, authentication guidance, remote-change detection, reviewed divergence integration | Ordinary pull is fast-forward only; divergence recovery uses merge; no automatic force push |

Key implementation entry points are under [`src-tauri/src`](../src-tauri/src) and [`src/components`](../src/components): `git_tools`, `version_control`, `commit_options`, `partial_stage`, `history`, `file_history`, `stash_tools`, `shelves`, `remotes`, `repository_setup`, `interactive_rebase`, `tag_tools`, `ignored_files`, `patch_tools`, `revision_tree` and `submodules`. See [Shelf and context actions](shelf-and-context-actions.md) for the new workflows.

## Remaining parity work

These gaps remain explicit rather than being hidden behind a blanket “all Git features” claim:

- Split hunks interactively and edit HEAD/index/working-tree versions together.
- Persistently manage Git identities and signing keys/settings beyond the implemented per-commit overrides.
- Offer pull-with-rebase/autostash policies, unshallow, and more merge/rebase options.
- Support multi-repository branch/push operations with clear per-repository results and recovery.
- Add rich conflict chunk navigation/acceptance, editor integration and external merge-tool launching.
- Extend interactive rebase to merge-aware plans, root/onto/update-refs options, edit stops, and more direct commit context actions.
- Add push-up-to-selected-commit, destination selection and an explicit guarded force-with-lease workflow.
- Improve branch-versus-working-tree comparison with an interactive changed-file list.
- Manage worktree creation/removal and advanced submodule add/remove/recursive/remote update workflows.
- Add task changelists and partial unshelving; the implemented local shelf is separate from Git stash and local edit history.
- Manage remote-only tags, batch operations, multiple URL configuration and richer signing verification.
- Provide optional configurable commit checks; PhpStorm's PHP inspections, import cleanup and deployment plugins are separate IDE capabilities.
- Add hosting provider integrations, pull requests and CI/CD through documented provider APIs. REA is an investigation tool, not the application's CI transport.

## Verification

The Windows development checks on 2026-10-10 produced the following results:

| Check | Result |
| --- | --- |
| Frontend suite | **233/233** tests passed across 26 files |
| Frontend build | TypeScript and production Vite build passed; the bundle-size warning remains |
| Native Git coverage | **117 distinct tests passed** across two runs: the initial full 102-test run passed 100 and exposed two defects; after fixing Windows clone-path normalization and selected rename stashes, a 33-test affected-module run passed all tests, including both previous failures and the added tests |
| Desktop command compilation | `cargo check --locked --manifest-path src-tauri/Cargo.toml --lib` passed |
| Normal executable | `monitor-cli` built successfully; its production sequence-editor entry point completed a real Git interactive rebase with quoted executable/plan paths, drop and reword operations, literal message contents, and a clean resulting index/worktree |
| Browser checks | Eight desktop combinations (four languages, light/dark) and four 420px layouts passed the exercised diff, selected-line staging, submodule and historical snapshot checks without page errors |
| Whitespace | `git diff --check` passed |

The native count combines successful tests from both runs; it is not a claim that a final full 117-test run was executed. Browser checks used read-only documentation fixtures and headless Edge. The production entry-point smoke exercised the normal CLI binary, not the desktop WebView. No signed release, installed GitOrbit upgrade, or macOS/Linux execution was performed for this change. The REA MCP server was connected independently; the currently running Codex session still needs reconnection to expose its tools.

### Shelf, context menus and overview follow-up

The subsequent Windows checks on the same date cover the shelf and overview implementation separately from the earlier baseline:

| Check | Result |
| --- | --- |
| Frontend coverage | **255 distinct tests passed** across the full run and an affected-file rerun. The last full run passed 254/255; its only failure was the new keyboard test's whitespace-sensitive accessible-name selector. After fixing that selector, all **9/9** shelf UI tests passed. An earlier five-second branch-test timeout passed in the subsequent full run with a 15-second budget. No final full 255-test run is claimed. |
| Real-Git shelf tests | **5/5** passed: selected index/worktree/new files with unrelated staged and unstaged work; renames and deletions; stale/unknown/overlapping targets and recovery refs; ignored new-file collisions; newer-base conflicts preserving the shelf |
| Existing stash regression | **5/5** passed after the selected snapshot storage refactor |
| Workspace status regression | **1/1** passed: nested untracked files match Version Control counts and ignore rules remain respected |
| Desktop compilation | Final `cargo check --locked --manifest-path src-tauri/Cargo.toml --lib` passed |
| Frontend build | Final TypeScript/production build passed; bundle-size warning remains |
| Browser confirmation | **12/12** read-only fixture cases passed in headless Edge: four languages in light/dark at 1360px and four light layouts at 420px. Checked overview counts, repository/file context menus, shelf preview and restore review, rollback review, commit reset review, RTL/LTR direction, overflow and page errors. Desktop and narrow screenshots were also inspected. |
| Design and whitespace | Changed-UI mechanical design detector returned no findings; `git diff --check` passed |

These changes remain local source changes and a development preview. They were not committed, pushed, released or installed as an application upgrade in this follow-up. The native test suites use temporary repositories, not the user's project changes. Browser previews do not execute writes.

Use the normal frontend test/build commands and the disposable real-Git tests in `monitor-cli`. See [`development.md`](development.md) for the project toolchain. Relevant suites exercise reviewed mutations, stale state rejection, credentials, branch tracking, no-overwrite setup, annotated tags, patch checks, file history and rebase behavior.

Native Git tests use temporary repositories and bare remotes rather than production repositories. Integration tests do not establish successful installation on every operating system. A source implementation, a passing test, a release artifact and an installed upgrade are separate evidence items.

## References

- [PhpStorm: Commit, amend, partial staging and push](https://www.jetbrains.com/help/phpstorm/commit-and-push-changes.html)
- [PhpStorm: Merge, rebase, cherry-pick and interactive rebase](https://www.jetbrains.com/help/phpstorm/apply-changes-from-one-branch-to-another.html)
- [PhpStorm: Git settings and update strategies](https://www.jetbrains.com/help/phpstorm/settings-version-control-git.html)
- [PhpStorm: Investigate changes and file history](https://www.jetbrains.com/help/phpstorm/investigate-changes.html)
- [PhpStorm: Changelists](https://www.jetbrains.com/help/phpstorm/managing-changelists.html)
- [PhpStorm: Shelve or stash changes](https://www.jetbrains.com.cn/en-us/help/phpstorm/shelving-and-unshelving-changes.html)
- [PhpStorm: Local History](https://www.jetbrains.com/help/phpstorm/local-history.html)
- [PhpStorm: Worktrees](https://www.jetbrains.com/ja-jp/help/phpstorm/use-git-worktrees.html)
- [REA repository](https://github.com/morluto/rea)
