import { useId } from "react";

export function GitOrbitWordmark() {
  const id = useId().replace(/:/g, "");
  const cutout = `${id}-cutout`;
  const orbit = `${id}-orbit`;

  return (
    <svg
      viewBox="180 180 1590 395"
      aria-hidden="true"
      className="h-8 w-36 text-black dark:text-[#fff0d3]"
    >
      <defs>
        {/* Only the illustrated O uses the bitmap. Lettering is resolution independent. */}
        <filter id={cutout} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  1 1 1 0 -0.15" />
        </filter>
        <clipPath id={orbit}>
          <path d="M660 545 C716 497 775 447 789 382 C803 309 810 275 870 242 C925 205 1019 223 1060 260 C1110 283 1204 239 1282 200 C1235 250 1173 294 1125 340 C1124 440 1092 513 1031 528 C955 561 867 546 823 505 C782 512 717 529 660 545Z" />
        </clipPath>
      </defs>
      <g fill="currentColor">
        <path d="M490 297 L449 329 C427 306 400 295 368 295 C311 295 269 334 269 386 C269 438 309 477 366 477 C410 477 443 454 455 414 H351 V367 H513 V399 C513 474 451 526 367 526 C278 526 211 467 211 387 C211 308 278 247 368 247 C418 247 459 264 490 297Z" />
        <rect x="542" y="251" width="52" height="48" rx="15" />
        <path d="M542 320 H594 V521 H542Z" />
        <path d="M637 286 L689 264 V320 H733 V367 H689 V445 C689 465 700 479 725 481 L698 514 C657 510 637 486 637 445 V367 H614 V320 H637Z" />
        <path d="M1154 320 H1205 V346 C1224 327 1248 319 1279 319 V367 C1234 363 1206 385 1206 426 V521 H1154Z" />
        <path fillRule="evenodd" d="M1298 247 L1350 269 V347 C1369 328 1395 318 1422 318 C1480 318 1522 360 1522 422 C1522 482 1480 526 1421 526 C1390 526 1365 514 1350 496 V521 H1298Z M1350 422 C1350 456 1375 480 1408 480 C1443 480 1468 456 1468 422 C1468 387 1443 364 1408 364 C1375 364 1350 387 1350 422Z" />
        <rect x="1542" y="251" width="52" height="48" rx="15" />
        <path d="M1542 320 H1594 V521 H1542Z" />
        <path d="M1633 286 L1685 264 V320 H1737 L1708 367 H1685 V445 C1685 465 1696 479 1721 481 V521 C1661 521 1633 496 1633 445 V367 H1610 V320 H1633Z" />
      </g>
      <g clipPath={`url(#${orbit})`}>
        <path d="M851 401 C839 347 861 294 905 276 C958 252 1025 276 1051 320 L866 423 Q853 423 851 401Z" fill="#000" />
        <image href="/gitorbit-wordmark-v2.png" width="1942" height="810" filter={`url(#${cutout})`} />
      </g>
    </svg>
  );
}
