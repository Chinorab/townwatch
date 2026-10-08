// "How this was made" (FR-018, US5): the recorded figures behind this briefing, from the
// official sources found to the cost of every model call. Served from cache: viewing it is free.
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import type { Briefing } from "@/lib/schemas";
import { MODEL_IDS } from "@/lib/models";
import { longDate, ROLE_LABEL } from "../briefing/format";
import { panelView } from "./panel";
import styles from "./panel.module.css";

const REASON: Record<string, string> = {
  routine: "routine (minutes, appointments, reports)",
  info_only: "information only, no decision",
  low_impact: "decisions with little effect on residents",
  cap: "important, beyond the explanation limit",
  untriaged: "not sorted",
};

const fmt = (n: number) => n.toLocaleString("en-US");
const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);

export function HowThisWasMade({ b }: { b: Briefing }) {
  const p = b.panel;
  const view = panelView(p.totals);
  const fallbacks = b.headlineItems.filter((h) => h.explanation.model !== MODEL_IDS.ultra).length;
  const notExplained = Object.entries(p.routingCounts).filter(([k]) => k !== "rule_match");

  return (
    <section className={styles.panel} aria-labelledby="made-title">
      <h2 id="made-title" className={styles.title}>
        How this was made
      </h2>
      <p className={styles.dek}>
        Analysed on {longDate(b.generatedAt)}. Every figure below was recorded during that work. Reading this page costs nothing more: it is served
        from the stored briefing.
      </p>

      <ol className={styles.flow}>
        <li>
          <span className={`${styles.big} num`}>{p.sourcesKept.length}</span>
          <span className={styles.what}>official agenda {p.sourcesKept.length === 1 ? "source" : "sources"} kept</span>
          <span className={styles.how}>
            Found by web search, then checked by Nemotron 3 Nano: official, right place, right board. {fmt(p.sourcesRejected.length)} candidates rejected.
          </span>
        </li>
        <li aria-hidden className={styles.arrow}>
          <ArrowRight size={24} />
        </li>
        <li>
          <span className={`${styles.big} num`}>{fmt(p.itemsTotal)}</span>
          <span className={styles.what}>agenda items read</span>
          <span className={styles.how}>Numbered exactly as in the official documents.</span>
        </li>
        <li aria-hidden className={styles.arrow}>
          <ArrowRight size={24} />
        </li>
        <li>
          <span className={`${styles.big} num`}>{fmt(p.itemsTriaged)}</span>
          <span className={styles.what}>sorted by Nemotron 3 Nano 30B</span>
          <span className={styles.how}>Topic, decision or not, effect on residents, places named. Ten items per request.</span>
        </li>
        <li aria-hidden className={styles.arrow}>
          <ArrowRight size={24} />
        </li>
        <li>
          <span className={`${styles.big} num`}>{fmt(p.itemsEscalated)}</span>
          <span className={styles.what}>explained by Nemotron 3 Ultra 550B</span>
          <span className={styles.how}>
            Each sentence checked against the source text: {fmt(p.droppedStatements)} removed.
            {fallbacks > 0 ? ` ${fallbacks} written by Nemotron 3 Super after Ultra did not answer in time.` : ""}
          </span>
        </li>
      </ol>

      {notExplained.length > 0 && (
        <p className={styles.reasons}>
          Not explained, and listed as written instead:{" "}
          {notExplained.map(([k, n], i) => (
            <span key={k}>
              {i > 0 ? ", " : ""}
              <span className="num">{n}</span> {REASON[k] ?? k}
            </span>
          ))}
          .
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="visually-hidden">Model calls, tokens and estimated cost for this place</caption>
          <thead>
            <tr>
              <th scope="col">Model on Nebius Token Factory</th>
              <th scope="col">Calls</th>
              <th scope="col">Tokens in</th>
              <th scope="col">Tokens out</th>
              <th scope="col">of which reasoning</th>
              <th scope="col">Cost</th>
            </tr>
          </thead>
          <tbody>
            {view.models.map((m) => (
              <tr key={m.id}>
                <th scope="row">{m.label}</th>
                <td className="num">{fmt(m.calls)}</td>
                <td className="num">{fmt(m.input)}</td>
                <td className="num">{fmt(m.output)}</td>
                <td className="num">{fmt(m.reasoning)}</td>
                <td className="num">{usd(m.costUsd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="num">{fmt(p.totals.calls)}</td>
              <td colSpan={3} />
              <td className="num">{usd(p.totals.costUsd)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={styles.note}>
        {view.pricesAreEstimates ? "Costs are estimates from published per token prices. " : ""}
        Web search and document reading used {fmt(p.totals.tavilyCredits)} Tavily credits.
      </p>

      <details className={styles.sources}>
        <summary>Sources kept and rejected</summary>
        <ul>
          {p.sourcesKept.map((s) => (
            <li key={s.url}>
              <strong>Kept, {ROLE_LABEL[s.role].toLowerCase()}:</strong> <a href={s.url}>{s.url}</a>
            </li>
          ))}
          {p.sourcesRejected.map((s, i) => (
            <li key={`${s.url}-${i}`}>
              <strong>Rejected:</strong> <span className={styles.url}>{s.url}</span> <span className={styles.reason}>{s.reason}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
