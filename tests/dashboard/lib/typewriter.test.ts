import { describe, expect, it } from "vitest";
import {
  advanceTypewriter,
  INITIAL_TYPEWRITER_FRAME,
} from "../../../src/dashboard/lib/typewriter";

describe("advanceTypewriter", () => {
  it("types, pauses, erases, and advances", () => {
    let step = advanceTypewriter(INITIAL_TYPEWRITER_FRAME, 2, 2);
    expect(step).toEqual({
      frame: { messageIndex: 0, characterIndex: 1, deleting: false },
      delay: 55,
    });

    step = advanceTypewriter(step.frame, 2, 2);
    step = advanceTypewriter(step.frame, 2, 2);
    expect(step.delay).toBe(7_830);
    expect(step.frame.deleting).toBe(true);

    step = advanceTypewriter(step.frame, 2, 2);
    step = advanceTypewriter(step.frame, 2, 2);
    step = advanceTypewriter(step.frame, 2, 2);
    expect(step).toEqual({
      frame: { messageIndex: 1, characterIndex: 0, deleting: false },
      delay: 0,
    });
  });
});
