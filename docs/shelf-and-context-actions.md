# Shelf and context actions

The Shelf saves selected local changes so another task can continue in the same repository. It keeps staged and unstaged versions, new files, renames and deletions. It does not create a branch commit or push changes.

## Save and restore

1. Open a repository's **Version Control** tab and select files.
2. Choose **Shelve selected…** from the toolbar or the file context menu, enter a name, review the selected paths and confirm.
3. Open **Shelf** from Version Control, the repository menu or the branches/tools view.
4. Select a saved entry. Its working-tree, staged and unversioned groups show individual saved-file diffs.
5. Choose **Unshelve…**, review the target and confirm. Restoring retains the original shelf; removing it is a separate reviewed action.

Saving resets only the selected paths to their committed state. Restoring preserves unrelated staged and unstaged changes. Local changes that overlap saved paths block restoration; an ignored file that would collide with a saved new file also blocks restoration. A conflict with a newer committed version preserves the shelf and asks the user to resolve the Git operation before retrying. Refresh and review again if repository state changes.

Shelves are Git objects held by `refs/gitorbit/shelves/…`, separate from `refs/stash`. They survive closing GitOrbit and ordinary Git garbage collection while referenced, and are local to that repository. Deleting a shelf creates a `refs/gitorbit/recovery/…` reference first. This is not a cloud backup, task changelist, editor Local History service or partial/hunk unshelving workflow.

## Context menus

Right-click a repository, changed file, outgoing file, graph commit, branch, tag, recovery entry or shelf to see relevant actions. The keyboard context-menu key or **Shift+F10** opens the menu from a focused item. Visible three-dot buttons provide menu access on repository, branch, tag, recovery and shelf rows.

For changed files, right-clicking an unchecked file targets that one file. Right-clicking a checked file targets the checked selection in that file group. Stage, unstage, shelve, history and rollback are offered only where applicable. Conflict operations open their review view; an unversioned file is not offered tracked-file rollback. Outgoing committed files provide diff/history/copy actions rather than local rollback.

Commit menus expose file review, create-branch, cherry-pick, revert and reset workflows. Branch/tag/recovery actions use the existing guarded operation review. Selecting a destructive menu item prepares a review; confirmation remains a separate action.

## Delete local files

Choose **Delete file** from a changed/unversioned file's context menu, or select files and open **More file actions**. The menu, dialog title and confirmation button use **Delete files** when the action targets multiple files. The confirmation uses one short sentence explaining permanent deletion from the project folder without the Recycle Bin. A separate review lists the exact paths before deletion. Right-clicking a checked file uses checked files in that group; right-clicking an unchecked file targets just that file.

Deletion permanently removes regular files from disk without using the Recycle Bin. Git cannot restore unversioned content or unstaged edits that were never saved in Git. Save valuable work to Shelf before deleting it if needed. This action leaves the index unchanged and does not commit or push: tracked deletions remain visible until staged. An already staged new file retains its staged content even after its working copy is removed.

The backend validates the entire selection before starting, rejects stale reviews, clean/ignored/missing files, folders, submodules, symbolic links and Windows reparse points, and refuses deletion during an active Git operation. If a filesystem error interrupts a multi-file deletion, the error reports how many files were removed and the path where it stopped. The list refreshes after success or failure; retrying requires an explicit fresh review.

## Workspace counts

The main list separates **Changed files**, **Commits to push** and **Commits to pull**, followed by the suggested next action. The repository branch appears below its name.

Changed files count each path once, even if both its index and working-tree versions changed. Hover or focus the count to see staged/unstaged/new details; those categories can overlap and should not be added together. New files inside a new directory count individually, matching Version Control rather than Git's collapsed directory status.

Push/pull counts use the last fetch. **No upstream** and unavailable counts are explicit. Failed or stale scans do not reuse old counts as current values. The default filter shows all repositories and reports the visible/total row count; users can choose the attention filter explicitly.

## Validation

Validation results and publication limits are recorded in [the parity matrix](phpstorm-git-parity.md#verification). Browser previews use read-only fixtures; mutation tests use disposable real-Git repositories.

### File deletion verification — 2026-10-10

- Final frontend suite: 271/271 tests passed in 29 files. Focused deletion/Version Control/translation coverage: 38/38 passed.
- Real-Git deletion tests on Windows: 7/7 passed, covering staged and working content, unrelated files, binary/unversioned names with spaces/metacharacters, unborn repositories, stale/retargeted reviews, complete selection validation, active operations, Windows directory junctions and partial failure on a locked file.
- The native library and command bridge compiled as part of the `monitor-cli` test build. TypeScript/Vite production build passed; the existing large-bundle warning remains (approximately 834 kB before compression).
- All 12 functional browser cases passed: four languages in desktop light/dark and four languages at 420 px in light mode. Changed and unversioned context menus, exact review paths, cancellation, selection toolbar, RTL/LTR and read-only preview failure were checked without page errors.
- `git diff --check` passed. No files from real user projects were deleted; mutation tests used disposable repositories. Unix-specific symlink tests, macOS/Linux desktop execution, installation, commit, push and release were not performed for this change.

The subsequent confirmation-copy refinement passed 42/42 focused frontend tests and the production build. Singular/plural labels are covered in all four languages, including the same-group selection and unchecked-file context behavior. Native deletion behavior did not change; native tests and the full frontend suite were not rerun for this copy refinement.
