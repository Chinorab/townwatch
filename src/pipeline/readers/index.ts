// Platform detection by URL pattern. Readers are written once per platform, never per city
// (constitution V); the tenant is taken from the URL.
import type { Platform } from "@/lib/schemas";
import { genericReader } from "./generic";
import type { Reader } from "./types";

export function detectPlatform(url: string): { platform: Platform; key: string | null } {
  const u = new URL(url);
  const legistar = u.hostname.match(/^([a-z0-9-]+)\.legistar\.com$/i);
  if (legistar && legistar[1] !== "webapi") return { platform: "legistar", key: legistar[1].toLowerCase() };
  const civic = u.hostname.match(/^([a-z0-9-]+)\.(?:portal|api)\.civicclerk\.com$/i);
  if (civic) return { platform: "civicclerk", key: civic[1].toLowerCase() };
  if (/(^|\.)boarddocs\.com$/i.test(u.hostname)) {
    const m = u.pathname.match(/^\/([a-z]{2})\/([^/]+)\//i);
    return { platform: "boarddocs", key: m ? `${m[1]}/${m[2]}` : null };
  }
  return { platform: "generic", key: null };
}

const readers: Partial<Record<Platform, Reader>> = { generic: genericReader };

export function registerReader(platform: Platform, reader: Reader) {
  readers[platform] = reader;
}

/** null means the platform is known but not readable in v1 (BoardDocs): shown as not covered. */
export function readerFor(platform: Platform): Reader | null {
  return readers[platform] ?? null;
}
