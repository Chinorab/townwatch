// npm run pipeline -- <stage|all> --place <placeId> [--county "<County> County"]
// Stages: discover (includes verify), read, all. Prints what was found and what it cost.
import { writeFileSync, mkdirSync } from "node:fs";
import { createContext } from "./context";
import { placeFromId } from "@/lib/places";
import { lookupPlace } from "@/lib/place-index";
import { findSources, readSources } from "./run";
import { analysePlace } from "./jobs";
import "./readers/register";
import { refreshAll } from "./refresh";
import { Recorder } from "./recording";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const stage = process.argv[2];
  const placeId = arg("place");
  if (!stage || (!placeId && stage !== "refresh")) {
    console.error('Usage: npm run pipeline -- <discover|read|all> --place nc-edgecombe-county [--county "Washtenaw County"]');
    console.error("       npm run pipeline -- refresh [--place nc-edgecombe-county]   (every followed place by default)");
    process.exit(1);
  }
  if (stage === "refresh") {
    const ctx = await createContext({ log: (m) => console.log("  ·", m) });
    const t0 = Date.now();
    const results = await refreshAll(ctx, placeId ? [placeId] : undefined, (r) =>
      console.log(`${r.placeId}: ${r.status}, ${r.newItems} new items, ${r.modelCalls} model calls, ~$${r.costUsd.toFixed(4)}, ${r.tavilyCredits} Tavily credits${r.detail ? ` (${r.detail})` : ""}`),
    );
    const cost = results.reduce((s, r) => s + r.costUsd, 0);
    console.log(`Refreshed ${results.length} places, ~$${cost.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    if (results.length > 0 && results.every((r) => r.status === "failed")) process.exit(1);
    return;
  }
  if (!placeId) return;
  // --record <file>: save every external response so the run can be replayed offline in tests
  // (tests/pipeline). Only responses not already cached are recorded: empty the cache first.
  const recordFile = arg("record");
  const recorder = recordFile ? new Recorder(recordFile) : undefined;
  const ctx = await createContext({ log: (m) => console.log("  ·", m), recorder });
  if (recorder) recorder.tape.now = ctx.now.toISOString();
  const place = placeFromId(placeId, arg("county"), lookupPlace(placeId));
  const progress = (s: string, d: string) => console.log(`[${s}] ${d}`);
  const t0 = Date.now();

  if (stage === "discover") {
    const r = await findSources(ctx, place, progress);
    console.log(JSON.stringify(r, null, 2));
  } else if (stage === "read") {
    const r = await findSources(ctx, place, progress);
    const read = await readSources(ctx, place.placeId, r.sources, progress);
    for (const m of read.meetings) console.log(`${m.date} ${m.body} → ${m.agendaUrl}`);
    for (const it of read.items) console.log(`  ${it.number.padEnd(6)} ${it.title}`);
  } else if (stage === "all") {
    const { briefing, newCalls, newTavilyCredits } = await analysePlace(ctx, place, progress);
    mkdirSync(".cache/briefings", { recursive: true });
    writeFileSync(`.cache/briefings/${placeId}.json`, JSON.stringify(briefing, null, 2));
    console.log(`\nBriefing: ${briefing.headlineItems.length} explained items, ${briefing.alsoOnAgenda.length} listed, ${briefing.meetings.length} meetings`);
    for (const h of briefing.headlineItems) {
      console.log(`\n■ ${h.item.number} ${h.explanation.headline?.text ?? h.item.title}`);
      for (const s of h.explanation.statements) console.log(`  - [${s.kind}] ${s.text}  ⟨${s.citation.quote.slice(0, 60)}⟩`);
      if (h.explanation.dropped.count) console.log(`  (dropped: ${h.explanation.dropped.reasons.join("; ")})`);
    }
    console.log(`\nSaved .cache/briefings/${placeId}.json`);
    const newCost = newCalls.reduce((s, c) => s + c.costUsd, 0);
    console.log(`This run: ${newCalls.length} model calls, ~$${newCost.toFixed(4)}, ${newTavilyCredits} Tavily credits`);
    console.log(`Place total: ${briefing.panel.totals.calls} calls, ~$${briefing.panel.totals.costUsd.toFixed(4)}, ${briefing.panel.totals.tavilyCredits} Tavily credits`);
  } else {
    console.error(`Unknown stage "${stage}"`);
    process.exit(1);
  }
  if (recorder) {
    recorder.save();
    console.log(`Recorded external responses to ${recordFile}`);
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
