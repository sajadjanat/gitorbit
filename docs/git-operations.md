# Git branch and change operations

Open a repository and click its branch widget, or select the **Branches** tab.
Local branches, remote branches, tags, and recovery references are searchable.
Star frequently used branches. Select a row, right-click it, or use its action menu.

| Area | Operations |
| --- | --- |
| Branches | Create from HEAD, another branch, or a commit; optional checkout; checkout local/remote branches or tags; rename; delete; compare; publish; set/unset upstream |
| Integration | Merge selected into current; rebase current onto selected; cherry-pick; revert; continue, abort, or skip an in-progress operation |
| Local changes | Stage, unstage, rollback selected tracked files; stash including untracked files; apply, pop, or drop a stash; smart checkout |
| History | Undo last commit; soft/mixed/hard reset to a revision; select a reflog entry; restore a saved revision as a branch |
| Conflicts | Three-way text editor with base, ours, theirs, and editable result; accept either side; mark resolved; continue the operation |
| Tags | Create a local tag from a commit and delete a local tag |

Operations show a confirmation with the current branch and selected target. A
native review token detects changes to HEAD, branches, stashes, Git configuration,
the index, and changed file contents. If the repository changed after review,
refresh and confirm the operation again. Commands use the existing per-repository
lock and always trigger a status refresh, including after conflicts or hook errors.

## Rollback and recovery

**Rollback selected** restores tracked files and their staged changes to HEAD.
Before restoring files, GitOrbit stores a stash backup of tracked work, including
the staged version. Newly added files become untracked; they are not silently
deleted. If restoring a renamed file would overwrite an untracked file at its
original path, rollback is refused until that work has been stashed.

**Undo last commit** moves the current branch back one parent and leaves file
changes in the working tree. **Revert commit** creates a reversing commit and
preserves existing history. **Reset** offers soft, mixed, and hard modes. Hard
reset requires a clean working tree. When existing local changes are unstaged by
reset, their original index and worktree are first preserved in a stash backup.

Deletion and history changes retain recovery references under
`refs/gitorbit/recovery/`. Open **Recovery** to restore a saved commit as a branch.
Dropped/popped stashes have a **Restore saved stash** action that also restores
their untracked files and index. References remain until explicitly managed with
Git; GitOrbit does not garbage-collect them automatically.

Local branch deletion uses Git's merged-branch check unless **Also delete if
commits are not merged** is selected. Remote deletion uses an exact
`--force-with-lease` check against the reviewed remote-tracking tip. A changed
remote is refused. Publishing a branch uses a normal push and sets its upstream;
it never forces a push over existing remote history.

## Conflicts

Select one conflicted file in **Version Control**, then choose **Edit conflict**.
Review base/ours/theirs, edit the result, and save it as resolved. Conflict markers
must be removed. For binary, non-UTF-8, or files over 2 MB, use an external editor
and then **Mark resolved**. Selecting multiple files also supports **Accept ours**,
**Accept theirs**, and **Mark resolved**. During rebase, ours is the new base and
theirs is the commit being replayed. Continue, abort, and skip live in Git operations.

Smart checkout stashes staged, unstaged, and untracked changes, switches branches,
then restores them. Its stash is preserved on checkout/application failure; a
recovery reference also survives successful restoration. Checkout refuses to
overwrite ignored local files.

## Verification

```powershell
npm run build
npm test
$env:RUST_TEST_THREADS = '2'
./scripts/local-toolchain.ps1 cargo test --locked --manifest-path src-tauri/Cargo.toml --bin monitor-cli
./scripts/local-toolchain.ps1 cargo check --locked --manifest-path src-tauri/Cargo.toml --lib
```

Integration tests use disposable repositories and bare remotes. They exercise
stale reviews, index/worktree preservation, branch deletion recovery, stash
recovery including untracked files, merge conflicts and continuation, rebase,
cherry-pick, revert, reset, undo, tags, remote checkout, publishing, and remote
deletion after the remote tip changes. UI tests verify review/confirmation,
translations, cancellation, selected-file scoping, and conflict editing.

The workflows follow the branch widget and commit operations documented in
[PhpStorm branch management](https://www.jetbrains.com/help/phpstorm/manage-branches.html)
and [undoing Git changes](https://www.jetbrains.com/help/phpstorm/undo-changes.html).
Interactive rebase, IDE shelves, and synchronized operations across multiple
repositories are outside this implementation.
