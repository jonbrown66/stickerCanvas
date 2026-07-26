import type { ReactNode } from "react";

interface IconProps {
  name:
    | "camera"
    | "image"
    | "close"
    | "rotate"
    | "trash"
    | "download"
    | "settings"
    | "sparkles"
    | "check"
    | "palette"
    | "stroke"
    | "sliders"
    | "scissors"
    | "text"
    | "shapes"
    | "rectangle"
    | "ellipse"
    | "triangle"
    | "diamond"
    | "line"
    | "fill"
    | "bold"
    | "align-left"
    | "align-center"
    | "align-right";
}

const paths: Record<IconProps["name"], ReactNode> = {
  camera: (
    <>
      <path d="M5 7h3l1.4-2h5.2L16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 4.5-4.5 3.2 3.2 2.3-2.3 6 6" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="m9 7 .7-2h4.6l.7 2" />
      <path d="m6.5 7 1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v11" />
      <path d="m7.5 10 4.5 4.5 4.5-4.5" />
      <path d="M5 20h14" />
    </>
  ),
  settings: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </>
  ),
  check: (
    <>
      <path d="M20 6 9 17l-5-5" />
    </>
  ),
  palette: (
    <>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.92 0 1.7-.75 1.7-1.67 0-.42-.16-.81-.43-1.12-.26-.3-.42-.71-.42-1.16 0-.92.75-1.67 1.67-1.67H16c3.31 0 6-2.69 6-6 0-4.96-4.49-8.38-10-8.38Z" />
    </>
  ),
  stroke: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" strokeWidth="2" strokeDasharray="4 3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88" />
      <path d="M14.47 14.47 20 20" />
      <path d="M8.12 8.12 12 12" />
    </>
  ),
  text: (
    <>
      <path d="M4 5h16" />
      <path d="M12 5v14" />
    </>
  ),
  shapes: (
    <>
      <rect x="4" y="4" width="10" height="10" rx="1.5" />
      <circle cx="16.5" cy="16.5" r="3.5" />
    </>
  ),
  rectangle: <rect x="4" y="6" width="16" height="12" rx="2" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="5.5" />,
  triangle: <path d="m12 4 8 16H4L12 4Z" />,
  diamond: <path d="m12 3 8 9-8 9-8-9 8-9Z" />,
  line: <path d="M4 18 20 6" />,
  fill: (
    <>
      <path d="m7 3 10 10-6.5 6.5a2.1 2.1 0 0 1-3 0l-3-3a2.1 2.1 0 0 1 0-3L11 7" />
      <path d="M3 21h18" />
    </>
  ),
  bold: (
    <>
      <path d="M7 4h6a4 4 0 0 1 0 8H7z" />
      <path d="M7 12h7a4 4 0 0 1 0 8H7z" />
    </>
  ),
  "align-left": <path d="M4 6h16M4 10h10M4 14h16M4 18h12" />,
  "align-center": <path d="M4 6h16M7 10h10M4 14h16M6 18h12" />,
  "align-right": <path d="M4 6h16M10 10h10M4 14h16M8 18h12" />,
};

export function Icon({ name }: IconProps) {
  return (
    <svg
      className="app-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
