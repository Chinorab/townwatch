// T032: which fast model should triage? Runs every candidate on the same 70 real, hand-labelled
// agenda items (tests/fixtures/triage-labels.json) with the production prompt and routing rule,
// and reports agreement, escalation precision/recall, latency and cost. Spends real credits
// (a few tenths of a cent). Run: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/eval-triage.ts
import { readFileSync, writeFileSync } from "node:fs";
import { MemoryKV } from "../src/lib/store";
import { Models, MODEL_IDS, modelConfigFromEnv, tokenFactoryTransport } from "../src/lib/models";
import { splitAgenda } from "../src/pipeline/stages/split";
import { triage } from "../src/pipeline/stages/triage";
import { route } from "../src/pipeline/stages/route";
import type { Ctx } from "../src/pipeline/context";

const { labels } = JSON.parse(readFileSync("tests/fixtures/triage-labels.json", "utf8")) as {
  labels: Record<string, { routine: boolean; decisionExpected: boolean; escalate: boolean }>;
};
const boc = splitAgenda(readFileSync("tests/fixtures/edgecombe-agenda-2026-10-05.md", "utf8"), { meetingId: "boc", docHash: "boc", docUrl: "boc" }, null);
const boe = splitAgenda(readFileSync("tests/fixtures/edgecombe-boe-agenda-2026-09-14.txt", "utf8"), { meetingId: "boe", docHash: "boe", docUrl: "boe" }, null);
const items = [...boc, ...boe];
const keyOf = (it: (typeof items)[number]) => `${it.meetingId}:${it.number}`;
const meetings = new Map([
  ["boc", { body: "Edgecombe County Board of Commissioners", date: "2026-10-05" }],
  ["boe", { body: "Edgecombe County Board of Education", date: "2026-09-14" }],
]);
const missing = items.filter((i) => !labels[keyOf(i)]).map(keyOf);
if (missing.length) console.warn("unlabelled items:", missing);

const report: Record<string, unknown> = {};
for (const model of [MODEL_IDS.nano, MODEL_IDS.lightning]) {
  const models = new Models(tokenFactoryTransport(), { ...modelConfigFromEnv(), fast: model });
  const ctx = { kv: new MemoryKV(), models, now: new Date(), log: console.log } as unknown as Ctx;
  const t0 = Date.now();
  const routed = route(await triage(ctx, items, meetings));
  const ms = Date.now() - t0;
  let routine = 0, decision = 0, tp = 0, fp = 0, fn = 0, n = 0;
  const disagreements: string[] = [];
  for (const it of routed) {
    const l = labels[keyOf(it)];
    if (!l || !it.triage) continue;
    n++;
    if (it.triage.routine === l.routine) routine++;
    if (it.triage.decisionExpected === l.decisionExpected) decision++;
    const esc = Boolean(it.routing?.escalate);
    if (esc && l.escalate) tp++;
    else if (esc && !l.escalate) { fp++; disagreements.push(`+ ${keyOf(it)} ${it.title.slice(0, 50)}`); }
    else if (!esc && l.escalate) { fn++; disagreements.push(`- ${keyOf(it)} ${it.title.slice(0, 50)} (${it.routing?.reason})`); }
  }
  const cost = models.calls.reduce((s, c) => s + c.costUsd, 0);
  const r = {
    itemsJudged: `${n}/${items.length}`,
    routineAgreement: +(routine / n).toFixed(3),
    decisionAgreement: +(decision / n).toFixed(3),
    escalated: tp + fp,
    escalationPrecision: +(tp / Math.max(1, tp + fp)).toFixed(3),
    escalationRecall: +(tp / Math.max(1, tp + fn)).toFixed(3),
    seconds: +(ms / 1000).toFixed(1),
    calls: models.calls.length,
    costUsd: +cost.toFixed(5),
    disagreements,
  };
  report[model] = r;
  console.log(model, JSON.stringify(r, null, 1));
}
writeFileSync("research/triage-eval.json", JSON.stringify({ date: new Date().toISOString(), items: items.length, report }, null, 2));
