# Workspace Monitor

Use actual shadcn/ui components, React, Radix, and Tailwind tokens. Dark zinc surfaces, Geist text, Geist Mono for counts and paths, and Lucide icons. English UI throughout.

The primary view is a compact table, not a dashboard of cards. Workspace tabs show attention counts. Changes are amber, push/pull blue, failures red, and clean status muted green. Labels always accompany color. Details appear in a sheet rather than expanding every row.

Each workspace continues monitoring while its tab is inactive. Local file notifications trigger debounced scans; periodic scans recover missed events. Remote fetch is explicit or opt-in every 60 seconds. Display scan and fetch timestamps separately. Unknown upstream and failed scans must never appear clean.

Keyboard navigation uses Radix tabs, native buttons, accessible names, focus rings, and searchable repositories. Closing a tab removes monitoring only. Folder actions open the OS file manager; repository write operations remain in the user's editor or terminal.
