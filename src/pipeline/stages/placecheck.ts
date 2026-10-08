// Second line of defence against same-named places: an agenda's letterhead names its own town
// and state ("VERNON PUBLIC SCHOOLS, Vernon, Connecticut 06066" was read for Vernon Parish,
// Louisiana on 2026-10-08). Only the first lines are checked, where the letterhead sits, so an
// item mentioning another state further down is not affected.
import { STATE_NAMES } from "@/lib/places";

export function letterheadOtherState(text: string, state: string): string | null {
  const head = text.slice(0, 400);
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    if (code === state) continue;
    if (new RegExp(`,\\s*${name}\\s+\\d{5}\\b`, "i").test(head)) return code;
    if (new RegExp(`,\\s*${code}\\s+\\d{5}\\b`).test(head)) return code;
  }
  return null;
}
