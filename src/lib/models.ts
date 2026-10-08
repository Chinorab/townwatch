// Every model call in Townwatch goes through here: Nebius Token Factory, NVIDIA Nemotron only.
// Routing tiers: "fast" (triage, verification; thinking off) and "explain" (Ultra, reasoning on,
// Super as fallback on timeout or server error). Each call is metered into a ModelCall record.
import OpenAI from "openai";
import type { z } from "zod";
import { costUsd } from "./prices";
import type { ModelCall } from "./schemas";

export const MODEL_IDS = {
  nano: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  lightning: "nvidia/Nemotron-3_5-Lightning",
  super: "nvidia/nemotron-3-super-120b-a12b",
  ultra: "nvidia/Nemotron-3-Ultra-550b-a55b",
} as const;

export type Tier = "fast" | "explain";

export interface ModelConfig {
  fast: string;
  explain: string;
  fallback: string;
  timeoutMs: Record<string, number>;
}

export function modelConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ModelConfig {
  const fast = env.MODEL_TRIAGE || MODEL_IDS.nano;
  const explain = env.MODEL_EXPLAIN || MODEL_IDS.ultra;
  const fallback = env.MODEL_FALLBACK || MODEL_IDS.super;
  return {
    fast,
    explain,
    fallback,
    // Ultra varies from 4 s to 96 s and once hung for 10+ minutes (Argus): never wait unbounded.
    timeoutMs: { [fast]: 60_000, [explain]: 150_000, [fallback]: 120_000 },
  };
}

/** Minimal shape of an OpenAI-compatible completion that we rely on. */
export interface Completion {
  choices: { message: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number | null } | null;
  } | null;
}

export interface CompletionRequest {
  model: string;
  messages: { role: "system" | "user"; content: string }[];
  max_tokens: number;
  temperature: number;
  chat_template_kwargs?: { enable_thinking: boolean };
}

/** Transport is injectable so tests replay recorded replies and never hit the network. */
export type Transport = (req: CompletionRequest, timeoutMs: number) => Promise<Completion>;

export function tokenFactoryTransport(env: NodeJS.ProcessEnv = process.env): Transport {
  const apiKey = env.NEBIUS_API_KEY;
  if (!apiKey) throw new Error("NEBIUS_API_KEY is not set");
  const client = new OpenAI({
    apiKey,
    baseURL: env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/",
    maxRetries: 1,
  });
  return async (req, timeoutMs) =>
    (await client.chat.completions.create(req as never, { timeout: timeoutMs })) as unknown as Completion;
}

export class ModelOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
  }
}

/** Pulls the first JSON object or array out of a reply that may carry fences or prose. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to bracket scan
  }
  const starts = [cleaned.indexOf("{"), cleaned.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) throw new Error("No JSON found in the model reply");
  const start = Math.min(...starts);
  const close = cleaned[start] === "{" ? "}" : "]";
  const end = cleaned.lastIndexOf(close);
  if (end <= start) throw new Error("Unterminated JSON in the model reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; name?: string; message?: string };
  if (e?.status && e.status >= 500) return true;
  if (e?.status === 429) return true;
  return /timeout|timed out|abort/i.test(`${e?.name} ${e?.message}`);
}

export interface ChatJsonOptions<S extends z.ZodTypeAny> {
  stage: ModelCall["stage"];
  tier: Tier;
  system: string;
  user: string;
  schema: S;
  maxTokens: number;
  ref?: string;
}

export class Models {
  readonly calls: ModelCall[] = [];

  constructor(
    private readonly transport: Transport,
    readonly config: ModelConfig = modelConfigFromEnv(),
  ) {}

  async chatJson<S extends z.ZodTypeAny>(opts: ChatJsonOptions<S>): Promise<z.infer<S>> {
    const primary = opts.tier === "fast" ? this.config.fast : this.config.explain;
    try {
      return await this.once(primary, opts, null);
    } catch (err) {
      // Ultra sometimes reasons until max_tokens and returns no JSON (seen 2026-10-08): an
      // unusable reply falls back to Super like a timeout does.
      if (opts.tier === "explain" && (isRetryable(err) || err instanceof ModelOutputError)) {
        return await this.once(this.config.fallback, opts, primary);
      }
      throw err;
    }
  }

  private async once<S extends z.ZodTypeAny>(model: string, opts: ChatJsonOptions<S>, fallbackFrom: string | null): Promise<z.infer<S>> {
    const thinkingOff = opts.tier === "fast" || model === this.config.fallback;
    const req: CompletionRequest = {
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      max_tokens: opts.maxTokens,
      temperature: thinkingOff ? 0 : 0.2,
      ...(thinkingOff ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    };
    const t0 = Date.now();
    let completion: Completion;
    try {
      completion = await this.transport(req, this.config.timeoutMs[model] ?? 120_000);
    } catch (err) {
      this.record(model, opts, null, Date.now() - t0, false, fallbackFrom);
      throw err;
    }
    const content = completion.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = extractJson(content);
    } catch (err) {
      this.record(model, opts, completion, Date.now() - t0, false, fallbackFrom);
      throw new ModelOutputError(String(err), content);
    }
    const result = opts.schema.safeParse(parsed);
    this.record(model, opts, completion, Date.now() - t0, result.success, fallbackFrom);
    if (!result.success) throw new ModelOutputError(`Schema mismatch: ${result.error.message.slice(0, 400)}`, content);
    return result.data;
  }

  private record(model: string, opts: ChatJsonOptions<z.ZodTypeAny>, c: Completion | null, ms: number, ok: boolean, fallbackFrom: string | null) {
    const input = c?.usage?.prompt_tokens ?? 0;
    const output = c?.usage?.completion_tokens ?? 0;
    const reasoning = c?.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    this.calls.push({
      stage: opts.stage,
      model,
      inputTokens: input,
      outputTokens: output,
      reasoningTokens: reasoning,
      ms,
      costUsd: costUsd(model, input, output),
      ok,
      fallbackFrom,
      ref: opts.ref ?? null,
      at: new Date().toISOString(),
    });
  }
}
