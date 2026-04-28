import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isReservedSlug } from "@/lib/reserved-slugs";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SLUG_LENGTH = 7;
const MAX_ATTEMPTS = 5;

export function generateSlug(): string {
  const out: string[] = [];
  while (out.length < SLUG_LENGTH) {
    const buf = randomBytes(SLUG_LENGTH * 2);
    for (let i = 0; i < buf.length && out.length < SLUG_LENGTH; i++) {
      const byte = buf[i];
      // Reject bytes that would bias the modulo: keep only the largest
      // multiple-of-62 range. 62 * 4 = 248, so accept 0..247.
      if (byte < 248) out.push(ALPHABET[byte % ALPHABET.length]);
    }
  }
  return out.join("");
}

export class SlugCollisionError extends Error {
  constructor() {
    super(`Failed to generate a unique slug after ${MAX_ATTEMPTS} attempts`);
    this.name = "SlugCollisionError";
  }
}

export async function createUniqueLink(
  url: string,
): Promise<{ slug: string }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slug = generateSlug();
    if (isReservedSlug(slug)) continue;
    try {
      const link = await prisma.link.create({ data: { slug, url } });
      return { slug: link.slug };
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) continue;
      throw err;
    }
  }
  throw new SlugCollisionError();
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}
