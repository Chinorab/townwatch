// Read side of the app: briefings come from the cache only (FR-022). No model call here.
import "server-only";
import { kvFromEnv } from "./store";
import type { Briefing } from "./schemas";

export async function getBriefing(placeId: string): Promise<Briefing | null> {
  if (!/^[a-z]{2}-[a-z0-9-]{2,80}$/.test(placeId)) return null;
  const kv = await kvFromEnv();
  return kv.get<Briefing>(`briefing:${placeId}`);
}

/** Places pre-analysed for the demo. A display list only: the pipeline knows nothing of it. */
export const DEMO_PLACES = [
  { placeId: "nc-edgecombe-county", name: "Edgecombe County", state: "North Carolina", note: "No local news source left (Medill, 2025)" },
] as const;
