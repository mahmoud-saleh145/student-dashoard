import type { NavIcon } from '@/components/layout/navigation';

/**
 * Navigation icons.
 *
 * Inline SVG rather than an icon package: there are twelve of them, they never
 * change, and shipping an icon library to render twelve glyphs is a large
 * dependency for a small job. Every one is `aria-hidden` — the label beside it
 * is the accessible name.
 */

const paths: Record<NavIcon, React.ReactNode> = {
  stats: (
    <>
      <path d="M4 19V9m5 10V5m5 14v-7m5 7V8" strokeLinecap="round" />
    </>
  ),
  courses: (
    <>
      <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" strokeLinejoin="round" />
      <path
        d="M7 11v4.2c0 .5.3 1 .8 1.2 1.2.6 2.7.9 4.2.9s3-.3 4.2-.9c.5-.2.8-.7.8-1.2V11"
        strokeLinecap="round"
      />
    </>
  ),
  students: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5 5 0 0 0-2-4" strokeLinecap="round" />
    </>
  ),
  teachers: (
    <>
      <circle cx="12" cy="7.5" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
      <path d="M4 4h4M4 4v3" strokeLinecap="round" />
    </>
  ),
  codes: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M3 10h18M7 14.5h3" strokeLinecap="round" />
    </>
  ),
  batches: (
    <>
      <rect x="3" y="4" width="13" height="9" rx="2" />
      <path d="M8 16h13M8 20h13M5 16h.01M5 20h.01" strokeLinecap="round" />
    </>
  ),
  support: (
    <>
      <path
        d="M20 12a8 8 0 1 0-3.2 6.4L21 20l-1.2-3.6A7.9 7.9 0 0 0 20 12Z"
        strokeLinejoin="round"
      />
      <path d="M9.5 10.5a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.7.6-.7 1.1v.3M12 17h.01" strokeLinecap="round" />
    </>
  ),
  notifications: (
    <>
      <path
        d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z"
        strokeLinejoin="round"
      />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" strokeLinecap="round" />
    </>
  ),
  announcements: (
    <>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5l-6 4H5a1 1 0 0 0-1 1Z" strokeLinejoin="round" />
      <path d="M17.5 9.5a4 4 0 0 1 0 5" strokeLinecap="round" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" strokeLinejoin="round" />
      <path d="M19 11h-3.5a1.5 1.5 0 0 0 0 3H19" strokeLinecap="round" />
    </>
  ),
  library: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" strokeLinejoin="round" />
      <path d="M10 4h4.5A1.5 1.5 0 0 1 16 5.5v13a1.5 1.5 0 0 1-1.5 1.5H10" strokeLinejoin="round" />
      <path d="M18 7.5 20.5 18" strokeLinecap="round" />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
    </>
  ),
  logs: (
    <>
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M14 3v5h5M8.5 13h7M8.5 17h4" strokeLinecap="round" />
    </>
  ),
  admins: (
    <>
      <path d="M12 3 5 6v5.5c0 4 3 7.6 7 9.5 4-1.9 7-5.5 7-9.5V6l-7-3Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 18.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 8a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
};

export function NavGlyph({ name, className }: { name: NavIcon; className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
