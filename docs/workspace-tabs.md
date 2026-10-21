# Workspace tab order and overview toolbar

Workspace tabs support pointer dragging and Alt+Shift+Left/Right. Arrow direction follows the physical layout in RTL. A destination marker previews the move; Escape, pointer cancellation and releasing outside a workspace tab leave the order unchanged. A successful move is announced to assistive technology.

Reordering saves the full ordered workspace array through the existing `save_workspaces` command. IDs, paths and auto-fetch preferences are retained. The current workspace stays selected when its order is saved. Failed saves retain the prior order and use the app's existing error message. Closing a workspace remains a separate action; movements are disabled while saving or while a repository operation blocks settings changes.

Pointer capture is used for internal tab dragging. It avoids dependence on operating-system file-drop handlers and adds no drag-and-drop dependency or native configuration change.

The overview puts Add repository beside workspace identity. Its compact toolbar groups search/filter and their filtered count, with Refresh, Fetch and Pull all together. Auto fetch is a checkbox inside Fetch settings, with an Auto indicator when enabled. A redundant unfiltered count and separate auto-fetch row are removed. Pull results remains available after a pull.

## Verification on 2026-10-21

- Final focused suite: **30/30 passed**, covering tab movement, preserved selection/settings, failed saves, cancelled/outside drops, keyboard RTL, persistence/reopening, auto-fetch settings and translation coverage.
- Browser sample-data checks: actual pointer drag in English LTR dark and Persian RTL light, RTL keyboard reordering, fetch-menu toggle, search count and a 640px layout without toolbar overflow. No real Git write was performed.
- Screenshots are retained locally under ignored `.dev/workspace-tabs-2026-10-21/`.
- The final production build and whitespace checks passed. Local browser checks do not establish installed-app behavior. Signed native package verification is tracked separately by the [0.7.3 release workflow](https://github.com/sajadjanat/gitorbit/releases/tag/v0.7.3).

The preview tab and temporary Vite server are closed after verification to release local resources.
