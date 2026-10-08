// GET /api/briefings/{placeId}: the latest briefing from cache (contracts/http-api.md). No spend.
import { getBriefing } from "@/lib/briefings";

export async function GET(_req: Request, ctx: RouteContext<"/api/briefings/[placeId]">) {
  const { placeId } = await ctx.params;
  const briefing = await getBriefing(placeId);
  if (!briefing) {
    return Response.json({ error: { code: "not_analysed", message: "This place has not been analysed yet." } }, { status: 404 });
  }
  return Response.json(briefing, { headers: { "Cache-Control": "public, max-age=300" } });
}
