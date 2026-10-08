// POST /api/analyses {placeId}: start an analysis, or return the running or fresh one
// (contracts/http-api.md). New places are subject to the limits of FR-024.
import { placeFromId } from "@/lib/places";
import { lookupPlace } from "@/lib/place-index";
import { kvFromEnv } from "@/lib/store";
import { checkNewPlace, recordNewPlace, LIMIT_MESSAGES } from "@/lib/limits";
import type { Analysis, Briefing } from "@/lib/schemas";
import { createAnalysis, getAnalysis } from "@/pipeline/jobs";
import { apiError, clientIp, serverContext } from "@/lib/server-context";

const FRESH_MS = 7 * 86_400_000;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { placeId?: string } | null;
  const indexed = lookupPlace(String(body?.placeId ?? ""));
  if (!indexed) return apiError(400, "bad_place", "Unknown place.");
  const place = placeFromId(indexed.placeId, undefined, indexed);
  const kv = await kvFromEnv();

  const briefing = await kv.get<Briefing>(`briefing:${place.placeId}`);
  if (briefing && Date.now() - new Date(briefing.generatedAt).getTime() < FRESH_MS) {
    return Response.json({ analysisId: briefing.analysisId, status: "done" }, { status: 200 });
  }

  const runningId = await kv.get<string>(`running:${place.placeId}`);
  const running: Analysis | null = runningId ? await getAnalysis(kv, runningId) : null;
  if (running && running.status !== "done" && running.status !== "failed") {
    return Response.json({ analysisId: running.analysisId, status: running.status }, { status: 202 });
  }

  const now = new Date();
  const ip = clientIp(req);
  const allowed = await checkNewPlace(kv, ip, now);
  if (!allowed.ok) return apiError(429, allowed.code, LIMIT_MESSAGES[allowed.code]);

  const ctx = await serverContext();
  const a = await createAnalysis(ctx, place);
  await recordNewPlace(kv, ip, now);
  return Response.json({ analysisId: a.analysisId, status: a.status }, { status: 202 });
}
