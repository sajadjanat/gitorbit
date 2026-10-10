# Interface simplification

This refinement focuses on inspecting or switching a branch, committing selected work and finding repository utilities. It preserves GitOrbit's existing shadcn interface, themes and four languages. It does not change Git mutation rules or add automatic checkout, merge, push or cleanup.

## Branches

| Previous friction | Current behavior |
| --- | --- |
| The outer Branches tab opened another seven-tab navigation strip | One Repository tools menu opens saved work, tags, remotes, submodules and recovery |
| Tags and recovery references appeared among local/remote branches as well as in separate tools | The branch list contains local and remote branches only; other refs have dedicated tools |
| Initial detail pane was empty until a branch was clicked | The current branch is selected on load and retained when refresh still contains it |
| The selected branch exposed many competing buttons, including disabled/destructive actions | Checkout, compare and merge are visible when relevant; advanced actions use More actions and context menus |
| Long commit hashes occupied the main detail area | Short hashes appear in metadata, with the full value available on hover |
| Remote branches competed with local work in every view | Remote branches expand on demand and automatically reveal search matches |

The current branch appears first; favorites sort other entries before the remaining names. Clicking a branch only selects it for inspection. Checkout and all write operations still open a review. Search filters local/remote branch names without hiding a matching remote behind a collapsed group.

Current branches do not offer a redundant checkout button. A current local branch without an upstream offers publishing, subject to the configured-remote guard. Advanced actions remain available, including rename, rebase, publish, upstream changes, and reviewed deletion. The current branch cannot be deleted from its menu.

More actions omits the checkout/compare/merge commands already visible in the detail pane. Comparisons have a close control that preserves the selected branch. Repository tabs use two columns on narrow layouts so wrapped tabs stay inside their navigation area.

## Correct locations for utilities

- Shelf and Stashes remain separate saved-work tools.
- Tags owns tag creation/publishing and remote deletion. Its context/actions menu also opens reviewed local tag deletion and creation of a branch from a tag.
- Recovery and history owns recovery references, reflog selection, undo, revision actions and interactive rebase.
- Remotes and Submodules retain their existing forms and guarded operations.
- A Branches back button returns from a utility without nesting another dialog.

The refinement removes duplicated navigation and default actions, rather than deleting these capabilities. Rare revision/ref combinations remain accessible through the existing reviewed revision workflows; they do not need to occupy the daily branch toolbar.

## Wider application review

| Surface | Decision |
| --- | --- |
| Workspace overview | Retain the recently clarified file/push/pull columns, next action and explicit attention filter |
| Version Control | Keep stage/unstage, Shelf and refresh visible; move selected shelving and rollback into More file actions, while retaining file context access |
| Commit area | Retain the explicit message and commit controls; optional identity/signing/amend settings already use progressive disclosure |
| Push | Retain outgoing commits, changed files and closeable side-by-side file diff |
| Graph/history | Retain the graph last and the existing collapsed filter form |
| Destructive operations | Retain separate reviews, stale-state rejection and existing recovery behavior |

Further compression should be based on observed usage. This pass does not assume that fewer installed features or hiding all labels would improve usability.

## Verification

Verified on 2026-10-10:

- Full frontend suite: 260/260 tests passed across 28 files, including branch selection, search, guarded actions, local tag deletion, comparison closing and translation coverage.
- Production TypeScript/Vite build passed. The existing large-bundle warning remains (approximately 826 kB before compression).
- Final functional browser check passed all 12 cases: English, Persian, Arabic and Chinese in desktop light/dark, plus each language at 420 px in light mode. It covered branch inspection, menus, merge review cancellation, comparison closing, repository utilities, local tag review, Shelf and narrow navigation bounds, with no page errors.
- Desktop and narrow screenshots were inspected in the initial visual pass and one confirmation pass. A separate stable functional run confirmed all cases after source edits stopped.

Browser checks use read-only documentation fixtures; they do not execute native Git writes. This turn changes frontend interaction and preview fixtures; it does not change native mutation rules. No macOS/Linux desktop run, installed desktop upgrade, commit, push or published release was performed for this refinement.
