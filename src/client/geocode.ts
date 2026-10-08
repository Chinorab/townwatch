// Browser-only geocoding of the reader's address (FR-021, research R8). The US Census geocoder
// has no CORS header but answers JSONP, so the address goes from this browser straight to the
// Census Bureau; Townwatch's servers never see it.
import type { Point } from "./near";

const ENDPOINT = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

interface CensusReply {
  result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] };
}

export function geocodeAddress(address: string, timeoutMs = 15_000): Promise<{ point: Point; matched: string } | null> {
  return new Promise((resolve, reject) => {
    const cb = `twGeo${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const w = window as unknown as Record<string, unknown>;
    const done = () => {
      clearTimeout(timer);
      delete w[cb];
      script.remove();
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error("The address service did not answer."));
    }, timeoutMs);
    w[cb] = (reply: CensusReply) => {
      done();
      const m = reply.result?.addressMatches?.[0];
      resolve(m ? { point: { lat: m.coordinates.y, lon: m.coordinates.x }, matched: m.matchedAddress } : null);
    };
    script.onerror = () => {
      done();
      reject(new Error("The address service could not be reached."));
    };
    const params = new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "jsonp", callback: cb });
    script.src = `${ENDPOINT}?${params}`;
    document.head.appendChild(script);
  });
}
