export type Note = {
  id: number;
  createdAt: number;
  text: string;
  tags: NoteTag[];
};

export type NoteTag = {
  id: number;
  name: string;
};

export type Tag = {
  id: number;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
};
