export type BackgroundTuning = { speed: number; intensity: number };

export const DEFAULT_BACKGROUND_TUNING: BackgroundTuning = {
  speed: 1,
  intensity: 1,
};

export const SPEED_RANGE = { min: 0.4, max: 2, step: 0.1 } as const;
export const INTENSITY_RANGE = { min: 0.5, max: 1.6, step: 0.1 } as const;

export const BACKGROUND_TUNING_KEY = "nest:background-tuning";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type TuningStorage = Pick<Storage, "getItem" | "setItem">;

export const readBackgroundTuning = (
  storage: TuningStorage = localStorage,
): BackgroundTuning => {
  const raw = storage.getItem(BACKGROUND_TUNING_KEY);
  if (!raw) return DEFAULT_BACKGROUND_TUNING;
  try {
    const parsed = JSON.parse(raw) as Partial<BackgroundTuning>;
    return {
      speed: clamp(Number(parsed.speed) || 1, SPEED_RANGE.min, SPEED_RANGE.max),
      intensity: clamp(
        Number(parsed.intensity) || 1,
        INTENSITY_RANGE.min,
        INTENSITY_RANGE.max,
      ),
    };
  } catch {
    return DEFAULT_BACKGROUND_TUNING;
  }
};

export const writeBackgroundTuning = (
  tuning: BackgroundTuning,
  storage: TuningStorage = localStorage,
) => {
  storage.setItem(BACKGROUND_TUNING_KEY, JSON.stringify(tuning));
  // The native `storage` event only fires in *other* windows, so also
  // signal same-window listeners (e.g. this Dashboard's own live background).
  if (storage === localStorage) window.dispatchEvent(new Event(BACKGROUND_TUNING_KEY));
};
