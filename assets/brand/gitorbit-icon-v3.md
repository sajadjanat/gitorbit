# GitOrbit transparent app icon

The native app icon is the standalone warm black-hole symbol on transparent alpha. The opaque black central shadow belongs to the symbol; the exterior field and gaps between the lower red contour ribbons are transparent. No tile or lettering is included.

Source: `gitorbit-app-icon-v3.png`. Generate the platform sizes, ICO and ICNS with `npx tauri icon assets/brand/gitorbit-app-icon-v3.png`. The favicon uses the generated 128px PNG at `public/gitorbit-icon-v3.png`.

Created with the built-in imagegen tool as a background-removal edit of the v2 app icon. The original generated file remains in the Codex image directory. Edit Sanitizer returned a ready contract and Prompt Compiler lint passed. The alpha channel was verified in the master and generated native PNGs, including transparent exterior samples and the opaque central shadow. The generated icon was visually reviewed at 128, 48 and 32 pixels on white and dark surfaces.

Windows incremental builds explicitly watch `src-tauri/icons/` so executable resources are rebuilt whenever the icon changes. All six embedded ICO frames (16, 24, 32, 48, 64 and 256 pixels) were verified against the transparent source in both the build and installed executable. The installed native icon has transparent corners; the updated app starts successfully and retains saved workspaces.

## Prompt

Use case: logo-brand. Background-removal edit of the supplied GitOrbit app icon. Make ONLY the exterior near-black field transparent, including the gaps between its three lower red orbital ribbons. Keep the actual black-hole central shadow opaque deep black. Preserve the same tilted ivory/amber event horizon, bright orange diagonal accretion band, red projecting tapered tips, proportions and safe margins. Preserve source composition and silhouette materially unchanged. The icon is ONLY the black-hole object floating on transparent alpha, with no square backdrop, no rounded tile, no text, no stars or border. Strip the diffuse exterior black haze while keeping clean smooth antialiased contour edges; do not add white fringe, speckled fragments or new glow. The dark interior of the hole is part of the object, not background to erase. Output one square transparent PNG, suitable on white, dark or colored desktop wallpaper.
