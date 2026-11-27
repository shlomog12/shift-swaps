// Line icons (24×24, stroke = currentColor) that look the same on every device, unlike emoji.
import type { ReactNode } from 'react';

function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="icon-svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const CalendarIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const SwapIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </Icon>
);

export const UserIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);

export const EyeIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const HistoryIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </Icon>
);

export const SettingsIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
);

export const NoteIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </Icon>
);

export const LockIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const ShareIosIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M6 12H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1" />
  </Icon>
);

export const MoreIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Icon>
);

/** Points right on screen in every direction of text (unlike the ‹ › characters, which RTL mirrors). */
export const ChevronRightIcon = ({ size = 24 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const ChevronLeftIcon = ({ size = 24 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const BellIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Icon>
);
