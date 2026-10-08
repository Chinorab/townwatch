// GET /api/analyses/{id}: progress of an analysis, by stage, with body coverage.
import { kvFromEnv } from "@/lib/store";
import { getAnalysis } from "@/pipeline/jobs";
import type { SourcesResult } from "@/pipeline/run";
import { apiError } from "@/lib/server-context";

export async function GET(_req: Request, ctx: RouteContext<"/api/analyses/[id]">) {
  const { id } = await ctx.params;
  const kv = await kvFromEnv();
  const a = await getAnalysis(kv, id);
  if (!a) return apiError(404, "unknown_analysis", "This analysis does not exist or has expired.");
  const found = await kv.get<SourcesResult>(`job:${id}:found`);
  return Response.json({ ...a, bodies: found?.bodies ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
