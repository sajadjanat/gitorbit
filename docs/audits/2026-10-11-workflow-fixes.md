# Workflow reliability and simplification

Date: 2026-10-11. Follow-up to the [product and Git workflow audit](2026-10-11-product-and-git.md). Changes are local and uncommitted; this is not a release record.

Release handoff: the user subsequently authorized publishing this work as [0.7.2](../releases/0.7.2.md). The results below describe pre-release verification; publication and platform verification are tracked separately in GitHub Actions and the ecosystem work card.

## Four corrected workflows

1. **Commit continuity.** Draft messages are stored per workspace/repository and survive closing the details panel and restarting the app. Checked files, selected previews and collapsed groups persist for the session. Visited tabs remain mounted when switching tabs. A failed commit keeps its draft.
2. **File-aware branch comparison.** Comparisons resolve both tips to immutable commit IDs and list changed files. Selecting a file loads only its patch, including rename/deletion and supported binary media previews. Local uncommitted edits are excluded. Literal path validation and file membership checks prevent arbitrary revision/path requests. The generic patch parser also resets at file boundaries.
3. **Live details.** Every successful monitor scan advances a repository-view revision, even when summary counts are unchanged. Version Control, outgoing commits, history and branch data refresh without remounting the panel or clearing the user's draft. Reads defer while an operation blocks them; failure does not masquerade as a successful scan.
4. **Consistent recovery.** Pull results and repository views share recovery for authentication, divergent history, local changes, active Git operations, stale review and network errors. Authentication never automatically retries a write. Pull sign-in uses the existing fetch-only authentication path and offers an explicit Retry pull. Batch retries target unfinished repositories and retain earlier successful results. Conflicts and pending operations link to Version Control and repository operations.

## Simpler navigation

- Repository tools are available from the repository header on every tab: saved work, tags, remotes, submodules and recovery/history.
- Clicking the branch opens the main Branches tab directly. Routine shelf and signing controls no longer duplicate the global tools and commit options.
- Comparison mode reserves space for the file list and side-by-side diff; branch action buttons return when it closes. File names and directories have separate visual hierarchy.
- Overview action badges lead to the relevant review. Outgoing preview has a named return-to-commits action, and technical push routes remain left-to-right in RTL locales.
- New recovery messages are translated in Persian, Arabic and Chinese.

## Verification

- Final full frontend run: **306/306 tests in 33 files passed**. Includes draft isolation/remount, tab continuity, same-count refresh, immutable per-file comparison, parser boundaries, recovery in four languages and unfinished-only batch retry.
- Native real-Git engine suite: **135/135 passed**. The newly added immutable file-comparison regression then passed independently through `--bin monitor-cli` (one passed, 135 filtered). It covers rename, deletion, binary content, literal names, excluded local edits and invalid revision/path rejection.
- Final `npm run build` passed (TypeScript and Vite). Existing bundle-size warning remains. `git diff --check` passed.
- Browser verification used read-only sample data: Persian RTL tab/draft continuity, file refresh, the common tools menu, switching comparison files and Pull failure → sign-in → explicit successful retry. No actual remote or working repository was changed by the demo.
- Local screenshots are retained in ignored `.dev/workflow-preview-2026-10-11/`; the interactive preview is `.dev/readme-preview.html?lang=fa` on the existing port 1420 dev server.

## Limits and remaining scope

The Windows GNU toolchain compiled the native library, but its GUI test harness exited before tests with `STATUS_ENTRYPOINT_NOT_FOUND`. Engine tests ran successfully through the CLI harness. Native WebView execution and packaged macOS/Linux applications were not tested in this change. An extra `cargo check --lib` was stopped to avoid redundant compilation under memory pressure; it is not reported as passed.

No push, tag, deployment, signed release or installed-app upgrade was requested or performed. The broader parity backlog (including richer conflict editing and workspace-scale improvements) remains separate from these four fixes.
