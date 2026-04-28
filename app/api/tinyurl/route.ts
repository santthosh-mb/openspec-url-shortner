import { createUniqueLink, SlugCollisionError } from "@/lib/slug";
import { parseSafeUrl } from "@/lib/url";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUrl = (body as { url?: unknown } | null)?.url;
  const safeUrl = parseSafeUrl(rawUrl);
  if (!safeUrl) {
    return Response.json(
      { error: "Invalid or unsupported URL" },
      { status: 400 },
    );
  }

  try {
    const { slug } = await createUniqueLink(safeUrl.toString());
    const origin = new URL(request.url).origin;
    return Response.json(
      { slug, shortUrl: `${origin}/${slug}` },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof SlugCollisionError) {
      return Response.json(
        { error: "Could not generate a unique slug" },
        { status: 500 },
      );
    }
    throw err;
  }
}
