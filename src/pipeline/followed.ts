// The list of followed places: every place with a published briefing, refreshed nightly (US6).
import type { KV } from "@/lib/store";

export const FOLLOWED_KEY = "index:followed";

export async function followedPlaces(kv: KV): Promise<string[]> {
  return (await kv.get<string[]>(FOLLOWED_KEY)) ?? [];
}

export async function follow(kv: KV, placeId: string): Promise<void> {
  const ids = await followedPlaces(kv);
  if (!ids.includes(placeId)) await kv.set(FOLLOWED_KEY, [...ids, placeId].sort());
}
