// Reads one document. Direct download first (PDF parsed page by page, so citations can carry a
// page), Tavily Extract as fallback for blocked sites and HTML (no page boundaries then).
// Cached by URL: a document is never fetched or paid for twice.
import { getDocumentProxy, extractText } from "unpdf";
import { getText, putText, sha256 } from "@/lib/store";
import type { DocumentRec } from "@/lib/schemas";
import type { Ctx } from "../context";
import type { DocRef } from "../readers/types";

interface Read {
  doc: DocumentRec;
  textHash: string | null;
}

const MIN_TEXT = 200;

function isPdf(contentType: string, bytes: Uint8Array): boolean {
  return /pdf/i.test(contentType) || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
}

export async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: { n: number; start: number; end: number }[] }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text: perPage } = await extractText(pdf, { mergePages: false });
  const pages: { n: number; start: number; end: number }[] = [];
  let text = "";
  (perPage as string[]).forEach((p, i) => {
    if (i > 0) text += "\n\n";
    const start = text.length;
    text += p;
    pages.push({ n: i + 1, start, end: text.length });
  });
  return { text, pages };
}

async function tryDirect(ctx: Ctx, url: string) {
  try {
    const r = await ctx.fetcher(url);
    if (r.status !== 200 || !isPdf(r.contentType, r.bytes)) return null;
    return await pdfText(r.bytes);
  } catch {
    return null;
  }
}

export async function readDocument(ctx: Ctx, ref: DocRef): Promise<{ doc: DocumentRec; text: string }> {
  const key = `docread:${sha256(ref.urls.join("|"))}`;
  const read = (await ctx.kv.get<Read>(key)) ?? (await readFresh(ctx, ref));
  // A failure can be transient (seen on 2026-10-08): retry after an hour instead of forever.
  if (!(await ctx.kv.get<Read>(key))) await ctx.kv.set(key, read, read.doc.readable ? undefined : 3_600);
  const text = read.textHash ? ((await getText(ctx.kv, read.textHash)) ?? "") : "";
  return { doc: read.doc, text };
}

async function readFresh(ctx: Ctx, ref: DocRef): Promise<Read> {
  const at = ctx.now.toISOString();
  for (const url of ref.urls) {
    const direct = await tryDirect(ctx, url);
    if (direct && direct.text.replace(/\s/g, "").length >= MIN_TEXT) {
      const textHash = await putText(ctx.kv, direct.text);
      return { textHash, doc: { docHash: textHash, url, kind: ref.kind, meetingId: ref.meetingId, retrievedAt: at, via: "direct", pages: direct.pages, readable: true } };
    }
  }
  const ex = await ctx.tavily.extract(ref.urls);
  // Several candidates may answer; a site-root link is listed last and is the one that exists
  // when both do (relative links on sites with a <base> tag), so prefer the last readable one.
  const hit = [...ex.results].reverse().find((r) => (r.raw_content ?? "").replace(/\s/g, "").length >= MIN_TEXT);
  if (hit) {
    const textHash = await putText(ctx.kv, hit.raw_content);
    return { textHash, doc: { docHash: textHash, url: hit.url, kind: ref.kind, meetingId: ref.meetingId, retrievedAt: at, via: "tavily_extract", pages: null, readable: true } };
  }
  ctx.log(`unreadable: ${ref.urls[0]} (${ex.failed.map((f) => f.error).join("; ")})`);
  return { textHash: null, doc: { docHash: sha256(ref.urls[0]), url: ref.urls.at(-1)!, kind: ref.kind, meetingId: ref.meetingId, retrievedAt: at, via: "tavily_extract", pages: null, readable: false } };
}
