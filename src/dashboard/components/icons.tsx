import type { SVGProps } from "react";

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

export const chevronsRightIcon = (
  <svg {...iconProps}>
    <polyline points="6 6 12 12 6 18" />
    <polyline points="13 6 19 12 13 18" />
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

export function CoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </svg>
  );
}

export const saveLayoutIcon = (
  <svg {...iconProps}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 12h8" />
    <path d="M12 8v8" />
  </svg>
);

export function InsightsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 16l5-5 3.5 3.5L20 7" />
      <path d="M15 7h5v5" />
    </svg>
  );
}

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
    </svg>
  );
}

export function AssistantIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-5 3v-3.5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z" />
      <path d="M8 11.5h8" />
    </svg>
  );
}

export const assistantIcon = <AssistantIcon />;

export const editIcon = (
  <svg {...iconProps}>
    <path d="m4 20 4.2-1 10.7-10.7a2.1 2.1 0 0 0-3-3L5.2 16Z" />
    <path d="m14.5 6.7 3 3" />
  </svg>
);

export const sendIcon = (
  <svg {...iconProps}>
    <path d="m4 4 17 8-17 8 3-8Z" />
    <path d="M7 12h14" />
  </svg>
);

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <line x1="4" x2="20" y1="7" y2="7" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="17" y2="17" />
      <circle cx="8" cy="7" r="2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="17" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export const settingsIcon = <SettingsIcon />;

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

export const minimizeIcon = (
  <svg {...iconProps}>
    <path d="M6 12h12" />
  </svg>
);

export const maximizeIcon = (
  <svg {...iconProps}>
    <path d="M9 4H4v5" />
    <path d="m4 4 6 6" />
    <path d="M15 20h5v-5" />
    <path d="m20 20-6-6" />
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
