import { afterEach, describe, expect, it, vi } from "vitest";
import { startPointerDrag } from "../../../src/dashboard/lib/pointerDrag";

afterEach(() => vi.unstubAllGlobals());

describe("startPointerDrag", () => {
  it("starts after the shared threshold and cleans up on release", () => {
    const listeners = new Map<string, Set<(event: PointerEvent) => void>>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: (event: PointerEvent) => void) => {
        const handlers = listeners.get(type) ?? new Set();
        handlers.add(listener);
        listeners.set(type, handlers);
      },
      removeEventListener: (type: string, listener: (event: PointerEvent) => void) => {
        listeners.get(type)?.delete(listener);
      },
    });
    let captured = false;
    const target = {
      setPointerCapture: () => {
        captured = true;
      },
      hasPointerCapture: () => captured,
      releasePointerCapture: () => {
        captured = false;
      },
    } as unknown as HTMLElement;
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();

    startPointerDrag(
      {
        pointerId: 1,
        clientX: 10,
        clientY: 10,
        currentTarget: target,
      } as Parameters<typeof startPointerDrag>[0],
      { onStart, onMove, onEnd, onCancel: vi.fn() },
    );
    const dispatch = (type: string, clientX: number, clientY: number) => {
      const event = {
        pointerId: 1,
        clientX,
        clientY,
        preventDefault: vi.fn(),
      } as unknown as PointerEvent;
      listeners.get(type)?.forEach((listener) => listener(event));
      return event;
    };

    dispatch("pointermove", 13, 14);
    expect(onStart).not.toHaveBeenCalled();
    dispatch("pointermove", 16, 10);
    expect(onStart).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledOnce();
    expect(captured).toBe(true);

    dispatch("pointerup", 16, 10);
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), true);
    expect(captured).toBe(false);
    expect([...listeners.values()].every((handlers) => handlers.size === 0)).toBe(true);
  });
});
