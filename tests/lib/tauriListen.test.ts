import { beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import { subscribeTauriEvent, unlistenSafe } from "../../src/lib/tauriListen";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

const listenMock = vi.mocked(listen);

describe("unlistenSafe", () => {
  it("swallows Tauri's already-gone listener rejection", async () => {
    const unlisten = vi.fn(() =>
      Promise.reject(
        new TypeError(
          "undefined is not an object (evaluating 'listeners[eventId].handlerId')",
        ),
      ),
    );

    unlistenSafe(unlisten);
    unlistenSafe(unlisten);
    await Promise.resolve();

    expect(unlisten).toHaveBeenCalledTimes(2);
  });
});

describe("subscribeTauriEvent", () => {
  beforeEach(() => {
    listenMock.mockReset();
  });

  it("unlistens once when cleanup runs before listen resolves, then listen resolves", async () => {
    const unlisten = vi.fn(() => Promise.resolve());
    let resolveListen!: (value: typeof unlisten) => void;
    listenMock.mockReturnValue(
      new Promise((resolve) => {
        resolveListen = resolve;
      }),
    );

    const stop = subscribeTauriEvent("phase-changed", () => undefined);
    stop();
    stop();
    resolveListen(unlisten);
    await Promise.resolve();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("clears the stored unlisten so a second cleanup cannot double-unlisten", async () => {
    const unlisten = vi.fn(() => Promise.resolve());
    listenMock.mockResolvedValue(unlisten);

    const stop = subscribeTauriEvent("phase-changed", () => undefined);
    await Promise.resolve();
    stop();
    stop();
    await Promise.resolve();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
