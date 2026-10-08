// Tests must never spend credits or depend on the network: any real HTTP call fails loudly.
// Stages receive injected clients; tests pass fakes or recorded replies instead.
import { beforeEach } from "vitest";

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    throw new Error(`Network call blocked in tests: ${String(input)}`);
  }) as typeof fetch;
});
