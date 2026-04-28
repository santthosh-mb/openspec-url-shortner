import { prisma } from "@/lib/prisma";
import { isReservedSlug } from "@/lib/reserved-slugs";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/[slug]">,
) {
  const { slug } = await ctx.params;

  if (isReservedSlug(slug)) {
    return new Response(null, { status: 404 });
  }

  const link = await prisma.link.findUnique({ where: { slug } });
  if (!link) {
    return new Response(null, { status: 404 });
  }

  return Response.redirect(link.url, 307);
}
