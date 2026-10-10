# File previews and type icons

The file list uses locally bundled Material Icon Theme SVGs under its MIT license. Language/framework names, exact configuration filenames and compound extensions determine the logo. Git status remains a separate label and color. No icon requests leave the app.

Preview sources are read-only:

| View | Before | After |
| --- | --- | --- |
| Staged changes | HEAD | Index |
| Working changes | Index | Working file |
| Unversioned file | Empty | Working file |
| Outgoing/history commit | First parent | Selected commit |
| File history | First parent, original path for renames | Selected commit |
| Stash/shelf | Saved base/index as appropriate | Saved snapshot |
| Revision browser | — | Selected commit |

Supported images: PNG, JPEG/JFIF, GIF, WebP, SVG, AVIF, BMP and ICO. Transparent pixels use a checkerboard in both light and dark mode. Fit and 25–400% zoom apply to both sides. SVG is displayed as an image, never injected as HTML.

PDF uses a bundled PDF.js worker and local fonts, character maps and decoder assets. It renders pages to a bounded canvas and has previous/next page buttons. It does not execute PDF actions or offer embedded links/scripts. Password-protected or corrupt PDFs show an explanation. Audio (MP3, WAV, Ogg, FLAC, M4A, AAC) and video (MP4/M4V, WebM, Ogg, MOV) expose native controls without autoplay; codecs depend on the platform WebView. ZIP, Office, fonts and other unsupported binary formats show their type and size instead of raw binary text.

Each side is limited to **16 MiB**. Larger files return metadata without a base64 payload. Git objects are checked for regular-file modes before reading; working files reject symlinks and Windows reparse points, including linked ancestor folders. Repository-relative paths are literal, including brackets and Unicode; path traversal and `.git` access are rejected. File previews never stage files, change HEAD or restore snapshots.

`npm run dev` and `npm run build` prepare ignored `public/pdfjs` assets from the locked dependency. Production bundles include these assets; the preview works offline. The app CSP allows only local workers, local fetches, data media and WebAssembly compilation for PDF decoders.

Run `npm run docs:preview`, then open `/.dev/readme-preview.html?lang=fa&media=1` for read-only fixtures with mixed file types, before/after PNGs, SVG, a two-page PDF and an unsupported archive. `lang=en`, `lang=ar` and `lang=zh` exercise the other translations. Desktop Git state always comes from the native bridge; demo fixtures do not modify repositories.
