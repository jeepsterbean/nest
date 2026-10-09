const GAP = 6;
const VIEWPORT_PAD = 8;
const OPTION_HEIGHT = 26;
const OPTION_GAP = 1;
const MENU_CHROME = 10;
const MIN_WIDTH = 190;
const MAX_WIDTH = 300;
const MAX_VISIBLE = 8;
const SUBMENU_GAP = 4;
const SUBMENU_CHROME_TOP = 5;

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
  { minWidth = MIN_WIDTH, maxVisible = MAX_VISIBLE }: { minWidth?: number; maxVisible?: number } = {},
): MenuSelectBox {
  const width = Math.min(
    Math.max(MAX_WIDTH, minWidth),
    Math.max(minWidth, trigger.width),
    Math.max(0, viewport.width - VIEWPORT_PAD * 2),
  );
  const left = Math.max(
    VIEWPORT_PAD,
    Math.min(trigger.left, viewport.width - width - VIEWPORT_PAD),
  );
  const visible = Math.max(1, Math.min(optionCount, maxVisible));
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

export type SubmenuBox = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

/**
 * Place a flyout beside the row that opened it: to the right of the parent menu,
 * flipping left when it would leave the viewport, and lifting it so its content
 * stays on screen when the row sits low.
 */
export function placeSubmenu(
  row: { top: number },
  menu: { left: number; right: number },
  viewport: { width: number; height: number },
  { width, contentHeight }: { width: number; contentHeight: number },
): SubmenuBox {
  const fitWidth = Math.min(width, Math.max(0, viewport.width - VIEWPORT_PAD * 2));
  const rightLeft = menu.right + SUBMENU_GAP;
  const leftLeft = menu.left - SUBMENU_GAP - fitWidth;
  const left = rightLeft + fitWidth <= viewport.width - VIEWPORT_PAD
    ? rightLeft
    : leftLeft >= VIEWPORT_PAD
      ? leftLeft
      : Math.max(VIEWPORT_PAD, viewport.width - fitWidth - VIEWPORT_PAD);
  // The flyout's own padding offsets its first option, so align that option with the row.
  const top = Math.max(
    VIEWPORT_PAD,
    Math.min(row.top - SUBMENU_CHROME_TOP, viewport.height - VIEWPORT_PAD - contentHeight),
  );
  return { top, left, width: fitWidth, maxHeight: viewport.height - VIEWPORT_PAD - top };
}
