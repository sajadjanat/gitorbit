# GitOrbit larger app icon

The v4 icon fills more of the square canvas for a clearer Windows taskbar silhouette. It retains the transparent background, opaque central shadow, warm event horizon, projecting disk tips and three lower red ribbons. The main body is larger and the disk angle is steeper, using the space above and below the previous mark.

Source: `gitorbit-app-icon-v4.png`, created with the built-in imagegen tool as a composition edit of `gitorbit-app-icon-v3.png`. The original generated file is retained in the Codex image directory.

Regenerate native PNG, ICO and ICNS files with `npx tauri icon assets/brand/gitorbit-app-icon-v4.png`. The favicon is `public/gitorbit-icon-v4.png`. The app embeds the native 256px PNG as its default window icon. Windows bundles install `gitorbit-icon-v4.ico` and point matching existing shortcuts and the installed-program registry entry to that versioned file, avoiding the previous icon cache.

At 128px and an alpha threshold of 128, the visible height increased from 64px to 103px. Visible area increased from 2,808 to 5,374 pixels, about 91%. The generated 128px and 32px icons were visually inspected; exterior corners remain transparent. The installer migration checks verify that shortcut targets and arguments and saved workspace state are preserved.

## Edit brief

Enlarge the main black-hole body by roughly 35% relative to the square canvas. Reduce the extreme disk-tip span as necessary to keep both tips inside the frame, and use a steeper rising diagonal around 40–45 degrees. Target approximately 92–96% canvas width and 82–88% height, centered with small balanced margins. Preserve the existing rendering style, warm palette, dark central shadow, tapered projecting tips and lower ribbons. Keep the background truly transparent with no tile, text, haze or extra objects.
