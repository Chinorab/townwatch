// Pipeline context for API routes. Server only: the keys never leave this process.
import "server-only";
import "@/pipeline/readers/register";
import { createContext } from "@/pipeline/context";

export function serverContext() {
  return createContext({ log: (m) => console.log(`[pipeline] ${m}`) });
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}
