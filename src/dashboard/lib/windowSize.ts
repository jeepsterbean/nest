const MIN_WIDTH = 600;
const MIN_HEIGHT = 500;

export function nextDashboardSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
  direction: -1 | 1,
) {
  return {
    width: Math.min(maxWidth, Math.max(MIN_WIDTH, width + direction * 100)),
    height: Math.min(maxHeight, Math.max(MIN_HEIGHT, height + direction * 80)),
  };
}
