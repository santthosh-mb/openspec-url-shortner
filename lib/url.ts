export function parseSafeUrl(input: unknown): URL | null {
  if (typeof input !== "string" || input.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed;
}
