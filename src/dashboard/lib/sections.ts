export const SECTIONS = [
  { key: "recap", label: "Recap" },
  { key: "brainDump", label: "Brain dump" },
  { key: "tasks", label: "Tasks" },
  { key: "metrics", label: "Metrics" },
  { key: "phases", label: "Phases" },
] as const;

export type Section = (typeof SECTIONS)[number]["key"];

export const sectionLabel = (section: Section) =>
  SECTIONS.find((item) => item.key === section)!.label;

/** Keep in step with the width where `.section-sidebar` collapses in shell.css. */
export const COLLAPSED_SECTION_SIDEBAR = "(max-width: 600px)";
