export type BrainDump = {
  id: number;
  createdAt: number;
  text: string;
  tags: BrainDumpTag[];
};

export type BrainDumpTag = {
  id: number;
  name: string;
};

export type Tag = {
  id: number;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
};
