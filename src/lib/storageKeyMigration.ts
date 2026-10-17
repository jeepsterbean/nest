type MigratingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function removeLegacyValues(storage: MigratingStorage, legacyKeys: readonly string[]) {
  for (const key of legacyKeys) {
    if (storage.getItem(key) === null) continue;
    try {
      storage.removeItem(key);
    } catch {
      // The current value is authoritative; cleanup can retry on the next read.
    }
  }
}

/** Reads the current key first, then moves the newest legacy value without risking its loss.
 * `legacyKeys` runs newest first, since a key may have been renamed more than once. */
export function readMigratedStorageValue(
  storage: MigratingStorage,
  currentKey: string,
  legacyKeys: readonly string[],
): string | null {
  const current = storage.getItem(currentKey);
  if (current !== null) {
    removeLegacyValues(storage, legacyKeys);
    return current;
  }

  const legacy = legacyKeys
    .map((key) => storage.getItem(key))
    .find((value): value is string => value !== null);
  if (legacy === undefined) return null;

  try {
    storage.setItem(currentKey, legacy);
  } catch {
    // Keep the legacy value available when the migration write is refused.
    return legacy;
  }
  removeLegacyValues(storage, legacyKeys);
  return legacy;
}
