// GET /api/places?q=: resolve a typed name to US counties and towns, with the state, for
// disambiguation before any analysis (FR-001). No model or Tavily call.
import { searchPlaces } from "@/lib/place-index";
import { STATE_NAMES } from "@/lib/places";
import { kvFromEnv } from "@/lib/store";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const kv = await kvFromEnv();
  const candidates = await Promise.all(
    searchPlaces(q).map(async (p) => ({
      placeId: p.placeId,
      name: p.name,
      kind: p.kind,
      state: p.state,
      stateName: STATE_NAMES[p.state],
      analysed: Boolean(await kv.get(`briefing:${p.placeId}`)),
    })),
  );
  return Response.json({ candidates });
}
