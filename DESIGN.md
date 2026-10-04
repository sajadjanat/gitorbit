# Workspace Monitor

Use actual shadcn/ui components, React, Radix, and Tailwind tokens. Support light, dark, and system modes; Neutral, Violet, Ocean, and Forest palettes; a saved custom accent. Apply theme tokens at the document root so dialogs share the theme. Geist text, Geist Mono for counts and paths, and Lucide icons. English UI throughout.

The primary view is a compact table. Workspace tabs show attention counts. Changes are amber, push/pull blue, failures red, and clean status muted green. Labels always accompany color. Clicking a repository opens a wide dialog with Git graph and Version Control tabs. Keep commit rows compact with continuous colored parent connections, merge nodes, refs, author, and date.

Each workspace continues monitoring while its tab is inactive. Local file notifications trigger debounced scans; periodic scans recover missed events. Remote fetch is explicit or opt-in every 60 seconds. Display scan and fetch timestamps separately. Unknown upstream and failed scans must never appear clean.

Keyboard navigation uses Radix tabs, native buttons, accessible names, focus rings, and searchable repositories. Closing a tab removes monitoring only. Version Control groups staged, changed, and unversioned files with selection checkboxes and a diff pane. Stage or unstage only selected paths; commit the existing index with an explicit message. Pull one repository or all in the active workspace with fast-forward only, preserving local changes and reporting each result. Writes are explicit; never push automatically.
