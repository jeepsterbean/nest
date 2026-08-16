export type TypewriterFrame = {
  messageIndex: number;
  characterIndex: number;
  deleting: boolean;
};

export const INITIAL_TYPEWRITER_FRAME: TypewriterFrame = {
  messageIndex: 0,
  characterIndex: 0,
  deleting: false,
};

export const TYPEWRITER_CYCLE_MS = 8_000;
const TYPE_DELAY_MS = 55;
const DELETE_DELAY_MS = 30;

export function advanceTypewriter(
  frame: TypewriterFrame,
  messageLength: number,
  messageCount: number,
): { frame: TypewriterFrame; delay: number } {
  if (!frame.deleting && frame.characterIndex < messageLength) {
    return {
      frame: { ...frame, characterIndex: frame.characterIndex + 1 },
      delay: TYPE_DELAY_MS,
    };
  }
  if (!frame.deleting) {
    return {
      frame: { ...frame, deleting: true },
      delay: Math.max(
        0,
        TYPEWRITER_CYCLE_MS -
          messageLength * (TYPE_DELAY_MS + DELETE_DELAY_MS),
      ),
    };
  }
  if (frame.characterIndex > 0) {
    return {
      frame: { ...frame, characterIndex: frame.characterIndex - 1 },
      delay: DELETE_DELAY_MS,
    };
  }
  return {
    frame: {
      messageIndex: (frame.messageIndex + 1) % messageCount,
      characterIndex: 0,
      deleting: false,
    },
    delay: 0,
  };
}
