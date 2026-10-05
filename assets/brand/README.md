# GitOrbit brand

GitOrbit monitors Git repositories across workspaces. The identity uses a tilted black-hole O, an ivory-to-amber horizon and a projecting red accretion disk, with matching ivory lettering.

## Assets

- [Logotype](gitorbit-wordmark-v2.png): the application header and README wordmark.
- [App icon](gitorbit-app-icon-v2.png): the source for native PNG, ICO and ICNS icons.
- [Design direction, prompts and review](gitorbit-v2.md).
- [Design review packets](gitorbit-v2-design.json).

Regenerate native icons with `npx tauri icon assets/brand/gitorbit-app-icon-v2.png`.

The product is GitOrbit, the npm package is gitorbit, and the repository is https://github.com/sajadjanat/gitorbit. The application identifier, Rust binary name, signing key and saved preference keys remain stable for existing installations. The updater points to the renamed repository. Windows NSIS installers migrate verified Workspace Monitor installations in place; the former WiX upgrade code is pinned.

On Windows, verify the migration after building an NSIS bundle with `./scripts/test-installer-migration.ps1`.

The generated images are raster originals. Previous concepts are retained locally outside the published brand assets.
