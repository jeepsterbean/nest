// Shared inline SVG icons for the dashboard. `iconProps` is the common stroke
// styling spread onto each <svg>.
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export const clockIcon = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const plusIcon = (
  <svg {...iconProps}>
    <line x1="12" x2="12" y1="5" y2="19" />
    <line x1="5" x2="19" y1="12" y2="12" />
  </svg>
);

export const trashIcon = (
  <svg {...iconProps}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

export const chevronDownIcon = (
  <svg {...iconProps}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const chevronRightIcon = (
  <svg {...iconProps}>
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

export const checkIcon = (
  <svg {...iconProps}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const xIcon = (
  <svg {...iconProps}>
    <line x1="18" x2="6" y1="6" y2="18" />
    <line x1="6" x2="18" y1="6" y2="18" />
  </svg>
);

export const overviewIcon = (
  <svg {...iconProps}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <rect x="14" y="14" width="6" height="6" rx="1" />
  </svg>
);

export const saveLayoutIcon = (
  <svg {...iconProps}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 12h8" />
    <path d="M12 8v8" />
  </svg>
);

export const insightsIcon = (
  <svg {...iconProps}>
    <path d="M4 16l5-5 3.5 3.5L20 7" />
    <path d="M15 7h5v5" />
  </svg>
);

export const calendarIcon = (
  <svg {...iconProps}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M4 10h16" />
  </svg>
);

export const logsIcon = (
  <svg {...iconProps}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <path d="M8 4v16" />
    <path d="M11 8h5" />
  </svg>
);

export const tasksIcon = (
  <svg {...iconProps}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="m8 12 2.5 2.5L16 9" />
  </svg>
);

export const settingsIcon = (
  <svg {...iconProps}>
    <line x1="4" x2="20" y1="7" y2="7" />
    <line x1="4" x2="20" y1="12" y2="12" />
    <line x1="4" x2="20" y1="17" y2="17" />
    <circle cx="8" cy="7" r="2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
    <circle cx="11" cy="17" r="2" fill="currentColor" stroke="none" />
  </svg>
);

export const tagsIcon = (
  <svg {...iconProps}>
    <path d="M20 13 13 20 4 11V4h7z" />
    <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const promoteIcon = (
  <svg {...iconProps}>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </svg>
);

export const floatingDraftIcon = (
  <svg {...iconProps}>
    <path d="M6 3h12a3 3 0 0 1 3 3v9l-6 6H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" />
    <path d="M15 21v-4a2 2 0 0 1 2-2h4" />
  </svg>
);

export const gripIcon = (
  <svg {...iconProps}>
    <circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);
