// POST /api/analyses/{id}/advance: run the next bounded unit of work (research R6).
import { advance, getAnalysis } from "@/pipeline/jobs";
import { kvFromEnv } from "@/lib/store";
import { apiError, serverContext } from "@/lib/server-context";

export const maxDuration = 300;

export async function POST(_req: Request, ctx: RouteContext<"/api/analyses/[id]/advance">) {
  const { id } = await ctx.params;
  const pctx = await serverContext();
  const r = await advance(pctx, id);
  if (r === "locked") {
    const a = await getAnalysis(await kvFromEnv(), id);
    return Response.json({ ...a, locked: true }, { status: 409 });
  }
  if (!r) return apiError(404, "unknown_analysis", "This analysis does not exist or has expired.");
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
