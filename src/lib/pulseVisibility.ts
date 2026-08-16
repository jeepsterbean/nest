const HIDDEN_PULSES_KEY = "nest:hidden-pulse-ids";

type PulseStorage = Pick<Storage, "getItem" | "setItem">;

export function readHiddenPulseIds(storage: PulseStorage = localStorage) {
  return new Set(
    (storage.getItem(HIDDEN_PULSES_KEY) ?? "")
      .split(",")
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0),
  );
}

export function setPulseVisible(
  id: number,
  visible: boolean,
  storage: PulseStorage = localStorage,
) {
  const hidden = readHiddenPulseIds(storage);
  if (visible) hidden.delete(id);
  else hidden.add(id);
  storage.setItem(HIDDEN_PULSES_KEY, [...hidden].join(","));
  return hidden;
}
