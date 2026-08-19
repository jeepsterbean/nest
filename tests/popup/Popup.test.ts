import { describe, expect, it, vi } from "vitest";
import { resolvePopupOnce } from "../../src/popup/Popup";

describe("resolvePopupOnce", () => {
  it("keeps an in-flight completion from being overtaken and releases failed claims", async () => {
    const resolved = { current: false };
    let finish!: () => void;
    const completion = resolvePopupOnce(
      resolved,
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const dismiss = vi.fn();

    await resolvePopupOnce(resolved, dismiss);
    expect(dismiss).not.toHaveBeenCalled();

    finish();
    await completion;
    expect(resolved.current).toBe(true);

    const retryable = { current: false };
    await expect(
      resolvePopupOnce(retryable, () => Promise.reject(new Error("save failed"))),
    ).rejects.toThrow("save failed");
    expect(retryable.current).toBe(false);
  });
});
