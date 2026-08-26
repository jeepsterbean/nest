import { describe, expect, it } from "vitest";
import { composerTags } from "../../../src/dashboard/components/BrainDumpTags";
import type { Tag } from "../../../src/lib/types";

const tag = (id: number, lastUsedAt: number | null): Tag => ({
  id,
  name: `Tag ${id}`,
  createdAt: id,
  lastUsedAt,
});

describe("composerTags", () => {
  it("puts selected tags before five recent unselected tags", () => {
    const tags = [tag(1, 10), tag(2, 9), tag(3, 8), tag(4, 7), tag(5, 6), tag(6, 5), tag(7, null)];
    expect(composerTags(tags, [7, 2]).map(({ id }) => id)).toEqual([
      7, 2, 1, 3, 4, 5, 6,
    ]);
  });
});
