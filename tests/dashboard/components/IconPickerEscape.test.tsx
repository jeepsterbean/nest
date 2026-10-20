import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { IconPickerButton } from "../../../src/dashboard/components/PulseIcon";

const hooks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  setOpen: vi.fn(),
  focus: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useState: () => [true, hooks.setOpen],
  useRef: () => ({ current: { focus: hooks.focus } }),
}));

it("handles Escape in capture before parent menu dismissal and removes its listener", () => {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal("document", { addEventListener, removeEventListener });
  try {
    renderToStaticMarkup(createElement(IconPickerButton, {
      icon: "activity", label: "View", onChange: vi.fn(),
    }));
    const cleanup = hooks.effects[0]();
    const registration = addEventListener.mock.calls.find(([type]) => type === "keydown");
    expect(registration?.[2]).toBe(true);
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "key", { value: "Escape" });
    registration?.[1](event);
    expect(event.defaultPrevented).toBe(true);
    expect(hooks.setOpen).toHaveBeenCalledWith(false);
    expect(hooks.focus).toHaveBeenCalledOnce();
    if (typeof cleanup === "function") cleanup();
    expect(removeEventListener).toHaveBeenCalledWith("keydown", registration?.[1], true);
  } finally {
    vi.unstubAllGlobals();
  }
});
