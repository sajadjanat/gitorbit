# GitOrbit — luminous orbit identity (v2)

The user's reference replaces the previous monochrome direction. The O is a black-hole glyph with a dark center, an ivory-to-amber horizon, and a tilted accretion disk whose red tapered tips project beyond the circle. It sits slightly above and below the surrounding letterforms.

## Deliverables

- `gitorbit-wordmark-v2.png`: horizontal GitOrbit wordmark with shaped ivory letterforms, angled terminals and a single black-hole O.
- `gitorbit-app-icon-v2.png`: earlier standalone symbol on an ink-black field; replaced for app use by the [transparent v3 icon](gitorbit-icon-v3.md).
- `../../public/gitorbit-icon-v3.png`: active transparent favicon asset.
- `../../public/gitorbit-wordmark-v2.png`: original bitmap used by the application header logotype.
- `../../src-tauri/icons/`: current desktop PNG sizes, ICO and ICNS generated from the transparent v3 source.

These are raster originals, not editable vector masters. Generated originals remain in the Codex image directory. Previous concepts are retained locally outside the published brand assets.

The compact application header uses `src/components/git-orbit-wordmark.tsx`. The lettering is drawn with SVG paths matching the approved geometric forms, avoiding pixel-derived masks and their ivory fringes on light backgrounds. The illustrated O retains the approved bitmap, confined to its own silhouette; its exterior field is transparent and its central shadow remains opaque. Letters use black in light mode and ivory in dark mode. The header adds 8px horizontal and 4px vertical padding around a 144px-wide mark. Both modes were visually checked in the application preview. Current interface captures are in `docs/images/gitorbit-*.jpg`. The README hero artwork retains its original background; the native icon uses the transparent v3 asset.

## Craft and review

Used designly:brand-intelligence, designly:typography-director, designly:prompt-compiler, designly:visual-qa and designly:edit-sanitizer, with the built-in imagegen tool. No external messaging was performed.

Copy was checked character by character: G-i-t-O-r-b-i-t. The projected disk is separated from the adjacent t and r. At 128 and 32 pixels, the dark center and diagonal bright band remain visible; the smallest icon naturally loses fine ribbon detail. Both disk tips remain inside the canvas. Product branding is GitOrbit; the application identifier, signing key, Rust binary name and preference keys remain stable. The updater URL points to the renamed GitHub repository. The Windows installer migrates verified legacy installations and retains the former WiX upgrade code.

Prompt lint passed for the wordmark, symbol and padding correction; its four self-tests passed. Native icon generation and the frontend production build passed. The design review packets are in `gitorbit-v2-design.json`.

## Wordmark prompt

Use case: logo-brand. Generate a new horizontal GitOrbit logotype. The supplied image is a shape, lighting and palette reference, not an edit target.
Exact copy: "GitOrbit", G-i-t-O-r-b-i-t, on one line. Replace only its capital O with a black-hole glyph. The result must read GitOrbit, with no ordinary O in addition to the symbol and no detached icon.
Translate the reference's tilted accretion disk and gravitationally bent luminous rim into a compact designed glyph. Its circular shadow is deep black. The upper horizon is an ivory crescent flowing into amber, and three restrained ember-red elliptical contour ribbons describe the lower orbit. A bright accretion band crosses the lower third of the shadow on a 28-degree diagonal ascending from lower left to upper right. Tapered red-orange extensions project beyond the circular O at both ends, and slightly above the cap line: purposeful outgrowths, not a closed Saturn outline. Keep the black inner shadow large and distinct. Use smooth controlled color transitions and sharply defined silhouettes, retain the reference's dimensional light with far fewer rings. The accretion-band span is 1.45 times the O diameter, total glyph height 1.12 times capital G height.
Draw "Git" and "rbit" as one matching custom geometric sans wordmark in warm ivory, medium weight with open counters, a precise G aperture, softened square i dots, clean curved shoulders, subtle angled terminal cuts related to the orbital slant. Avoid generic heavy block lettering. Optically align the circular O and G, maintain coherent baseline and tight rhythmic spacing. Reserve enough air around projecting ribbons that they never collide with the t or r. O is integral to the word, not a large illustration separating two distant words.
Single centered wordmark on a uniform ink-black background (#08090c), wide landscape canvas, 12 percent external margins, no cropping. No tagline, presentation board, labels, repeated variations, starfield, cosmic background, lens flare, photographic noise, bevelled letters or metallic lettering.

## App icon prompt

Use case: logo-brand. Create a new standalone GitOrbit app icon using the supplied logotype as the visual identity reference.
Take ONLY the black-hole O symbol from the reference wordmark and reproduce its geometry, ivory-to-amber horizon crescent, red-orange diagonal accretion band and three ember-red lower contour ribbons. The icon must have the same tilted disk, black central shadow and projecting tapered ends as that O. Do not include any text or other letters.
Center the symbol on a square uniform ink-black field (#08090c). Leave 16 percent safe padding on every side, with the diagonal tips well inside the canvas. The disk ascends from lower left to upper right at about 28 degrees and projects past the circular horizon on both sides. Keep the black inner region large and readable, and make the main illuminated band clear at app-icon sizes. Retain controlled dimensional lighting while reducing tiny strands to smooth deliberately shaped contours. No starfield, speckled texture, lens flare, decorative dots, border, mockup, outer rounded tile or secondary objects. Render one single mark with sharp clean silhouettes and smooth bounded color transitions, suitable for a desktop app icon.

## Bounded padding correction prompt

Use case: logo-brand. Bounded app-icon padding correction.
Edit only the size and centering of the single black-hole symbol in the supplied source checkpoint. Uniformly scale the entire existing symbol to 77 percent of its current size, keeping its aspect ratio, and center it horizontally and vertically on the same square black canvas. Its two diagonal tips should now lie at approximately 16 percent and 84 percent of canvas width, leaving generous safe margins.
Keep the recognizable silhouette, three lower contour arcs, exact tilted disk direction, ivory/amber/red palette, relative geometry, illumination and smooth edge rendering materially unchanged. Do not redraw, redesign, simplify, add rings, change the disk angle, or restyle the mark. The black field outside the resized symbol is protected and must remain the same uniform ink-black. Keep square canvas and no cropping. No text, borders, stars, tiles, shadows or new objects. Allow only the minimal background blending needed at the resized symbol edges. Accept only if the padding visibly increases and the design itself remains recognizably the same.
