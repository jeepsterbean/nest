import { afterEach, expect, it, vi } from "vitest";
import { useTaskTableColumns } from "../../../src/dashboard/hooks/useTaskTableColumns";

vi.mock("react", () => ({
  useState: (value: unknown) => [value, vi.fn()],
  useRef: (current: unknown) => ({ current }),
  useMemo: (calculate: () => unknown) => calculate(),
  useCallback: (callback: unknown) => callback,
  useEffect: vi.fn(),
}));

afterEach(() => vi.unstubAllGlobals());

it("keeps heading clicks available and consumes the click following a heading drag", () => {
  const listeners = new Map<string, (event: unknown) => void>();
  vi.stubGlobal("window", {
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  });
  vi.stubGlobal("document", {
    documentElement: { classList: { add: vi.fn(), remove: vi.fn() } },
    elementFromPoint: () => null,
  });
  const columns = useTaskTableColumns([], vi.fn());
  const event = {
    button: 0, isPrimary: true, pointerId: 1, clientX: 0, clientY: 0,
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
    currentTarget: {
      setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn(),
    },
  } as unknown as Parameters<typeof columns.onMovePointerDown>[0];
  columns.onMovePointerDown(event, "title");
  listeners.get("pointerup")?.({ pointerId: 1 });
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(columns.consumeHeadingDrag()).toBe(false);

  columns.onMovePointerDown(event, "title");
  listeners.get("pointermove")?.({ pointerId: 1, clientX: 10, clientY: 0, preventDefault: vi.fn() });
  listeners.get("pointerup")?.({ pointerId: 1, clientX: 10, clientY: 0 });
  expect(columns.consumeHeadingDrag()).toBe(true);
  expect(columns.consumeHeadingDrag()).toBe(false);
});
