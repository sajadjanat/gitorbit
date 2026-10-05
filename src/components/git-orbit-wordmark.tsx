import { useId } from "react";

export function GitOrbitWordmark() {
  const id = useId().replace(/:/g, "");
  const cutout = `${id}-cutout`;
  const ink = `${id}-ink`;
  const letters = `${id}-letters`;

  return (
    <svg
      viewBox="180 180 1590 395"
      aria-hidden="true"
      className="h-8 w-36 text-black dark:text-[#fff0d3]"
    >
      <defs>
        {/* Remove the ink field at render time, retaining the original contours. */}
        <filter id={cutout} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  1 1 1 0 -0.15" />
        </filter>
        <filter id={ink} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 5 0 -3.3" result="letterAlpha" />
          <feFlood floodColor="currentColor" />
          <feComposite in2="letterAlpha" operator="in" />
        </filter>
        <clipPath id={letters}>
          <rect x="200" y="240" width="535" height="290" />
          <rect x="1150" y="240" width="600" height="290" />
        </clipPath>
      </defs>
      {/* The central shadow is opaque; the surrounding field is transparent. */}
      <path d="M851 401 C839 347 861 294 905 276 C958 252 1025 276 1051 320 L866 423 Q853 423 851 401Z" fill="#000" />
      <image href="/gitorbit-wordmark-v2.png" width="1942" height="810" filter={`url(#${cutout})`} />
      <g clipPath={`url(#${letters})`}>
        <image href="/gitorbit-wordmark-v2.png" width="1942" height="810" filter={`url(#${ink})`} />
      </g>
    </svg>
  );
}
