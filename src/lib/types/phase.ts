export type Phase = {
  id: number;
  name: string;
  icon: string;
  color: string | null;
  createdAt: number;
  inactiveSince: number | null;
};

export type PhaseCheckIn = {
  id: number;
  createdAt: number;
  phaseId: number | null;
  phaseLabel: string | null;
};
