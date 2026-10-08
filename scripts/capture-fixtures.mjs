// Captures real public documents and API responses as test fixtures (constitution IX),
// each saved with its source URL and retrieval date. No paid API is called here.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";

const dir = "tests/fixtures";
mkdirSync(dir, { recursive: true });
const now = new Date().toISOString();
const meta = {};

async function grab(name, url, kind = "json") {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  const body = kind === "bin" ? Buffer.from(await r.arrayBuffer()) : await r.text();
  writeFileSync(`${dir}/${name}`, body);
  meta[name] = { url, retrievedAt: now };
  console.log("saved", name, body.length);
}

await grab("annarbor-legistar-events.json", "https://webapi.legistar.com/v1/a2gov/events?$filter=EventDate+ge+datetime'2026-09-24'+and+EventDate+lt+datetime'2026-10-30'&$orderby=EventDate");
await grab("annarbor-legistar-eventitems-14160.json", "https://webapi.legistar.com/v1/a2gov/events/14160/eventitems?AgendaNote=1&Attachments=1");
await grab("columbia-civicclerk-events.json", "https://columbiacoga.api.civicclerk.com/v1/Events?$filter=startDateTime%20ge%202026-09-01T00:00:00Z%20and%20startDateTime%20le%202026-10-31T00:00:00Z&$orderby=startDateTime");
await grab("columbia-civicclerk-meeting-3463.json", "https://columbiacoga.api.civicclerk.com/v1/Meetings/3463");
await grab("columbia-civicclerk-agenda-13850.pdf", "https://columbiacoga.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=13850,plainText=false)", "bin");

// Edgecombe pages were read through Tavily Extract during step 1 (direct download is 403).
for (const [name, src] of [
  ["edgecombe-agenda-2026-10-05.md", "research/step1/raw/edgecombe-oct5-agenda.md"],
  ["edgecombe-agendas-listing.md", "research/step1/raw/edgecombe-nc-Board-of-Commissioners-0.md"],
]) {
  const text = readFileSync(src, "utf8");
  const url = text.match(/^<!-- (.*) -->/)?.[1];
  writeFileSync(`${dir}/${name}`, text.replace(/^<!-- .* -->\n/, ""));
  meta[name] = { url, retrievedAt: "2026-10-08T00:00:00Z", via: "tavily_extract" };
  console.log("copied", name);
}
writeFileSync(`${dir}/SOURCES.json`, JSON.stringify(meta, null, 2) + "\n");
