export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeCharacterName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
