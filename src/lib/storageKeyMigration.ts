type MigratingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Reads the current key first, then moves a legacy value without risking its loss. */
export function readMigratedStorageValue(
  storage: MigratingStorage,
  currentKey: string,
  legacyKey: string,
): string | null {
  const current = storage.getItem(currentKey);
  if (current !== null) {
    if (storage.getItem(legacyKey) !== null) {
      try {
        storage.removeItem(legacyKey);
      } catch {
        // The current value remains authoritative if legacy cleanup is unavailable.
      }
    }
    return current;
  }

  const legacy = storage.getItem(legacyKey);
  if (legacy === null) return null;

  try {
    storage.setItem(currentKey, legacy);
  } catch {
    // Keep the legacy value available when the migration write is refused.
    return legacy;
  }
  try {
    storage.removeItem(legacyKey);
  } catch {
    // The copied value is already authoritative; cleanup can retry on the next read.
  }
  return legacy;
}
