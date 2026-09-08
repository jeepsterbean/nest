export const BACKGROUND_STYLES = [
  { key: "orbs", label: "Drifting orbs" },
  { key: "noise", label: "Organic morph" },
  { key: "still", label: "Barely breathing" },
  { key: "particles", label: "Particle field" },
] as const;

export type BackgroundStyle = (typeof BACKGROUND_STYLES)[number]["key"];

export const BACKGROUND_STYLE_KEY = "nest:background-style";

type BackgroundStyleStorage = Pick<Storage, "getItem" | "setItem">;

const isBackgroundStyle = (value: string | null): value is BackgroundStyle =>
  BACKGROUND_STYLES.some((option) => option.key === value);

/** Drifting orbs is the default Background style. An unknown stored value falls back. */
export const readBackgroundStyle = (
  storage: BackgroundStyleStorage = localStorage,
): BackgroundStyle => {
  const stored = storage.getItem(BACKGROUND_STYLE_KEY);
  return isBackgroundStyle(stored) ? stored : "orbs";
};

export const writeBackgroundStyle = (
  style: BackgroundStyle,
  storage: BackgroundStyleStorage = localStorage,
) => {
  storage.setItem(BACKGROUND_STYLE_KEY, style);
  // The native `storage` event only fires in *other* windows, so also
  // signal same-window listeners (e.g. this Dashboard's own live background).
  if (storage === localStorage) window.dispatchEvent(new Event(BACKGROUND_STYLE_KEY));
};
