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
