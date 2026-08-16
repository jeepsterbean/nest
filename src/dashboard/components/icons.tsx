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

export const pencilIcon = (
  <svg {...iconProps}>
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

export const clockIcon = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const eyeOffIcon = (
  <svg {...iconProps}>
    <path d="M3 3l18 18" />
    <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
    <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9 6 9 6a15.6 15.6 0 0 1-2.1 2.8" />
    <path d="M6.2 6.2C4.2 7.5 3 10 3 10s3.5 6 9 6a9.8 9.8 0 0 0 3-.5" />
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

export const insightsIcon = (
  <svg {...iconProps}>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M8.4 14.5A7 7 0 1 1 15.6 14.5 4.2 4.2 0 0 0 14 18h-4a4.2 4.2 0 0 0-1.6-3.5z" />
  </svg>
);

export const journalIcon = (
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

export const metricsIcon = (
  <svg {...iconProps}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20V7" />
  </svg>
);
