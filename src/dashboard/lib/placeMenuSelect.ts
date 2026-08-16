const GAP = 6;
const VIEWPORT_PAD = 8;
const OPTION_HEIGHT = 26;
const OPTION_GAP = 1;
const MENU_CHROME = 10;
const MIN_WIDTH = 190;
const MAX_WIDTH = 300;
const MAX_VISIBLE = 8;

export type MenuSelectBox = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

/** Place a fixed menu beside a trigger, flipping up and clamping so it stays in view. */
export function placeMenuSelect(
  trigger: { top: number; left: number; bottom: number; width: number },
  viewport: { width: number; height: number },
  optionCount: number,
): MenuSelectBox {
  const width = Math.min(
    MAX_WIDTH,
    Math.max(MIN_WIDTH, trigger.width),
    Math.max(0, viewport.width - VIEWPORT_PAD * 2),
  );
  const left = Math.max(
    VIEWPORT_PAD,
    Math.min(trigger.left, viewport.width - width - VIEWPORT_PAD),
  );
  const visible = Math.max(1, Math.min(optionCount, MAX_VISIBLE));
  const desired =
    visible * OPTION_HEIGHT +
    Math.max(0, visible - 1) * OPTION_GAP +
    MENU_CHROME;
  const spaceBelow = viewport.height - trigger.bottom - GAP - VIEWPORT_PAD;
  const spaceAbove = trigger.top - GAP - VIEWPORT_PAD;
  const openUp = spaceBelow < desired && spaceAbove > spaceBelow;
  const available = Math.max(0, openUp ? spaceAbove : spaceBelow);
  return {
    top: openUp ? trigger.top - GAP : trigger.bottom + GAP,
    left,
    width,
    maxHeight: Math.max(OPTION_HEIGHT + MENU_CHROME, Math.min(desired, available)),
    openUp,
  };
}
