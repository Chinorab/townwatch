import { describe, expect, it } from "vitest";
import { redisCredentials } from "@/lib/store";

describe("redisCredentials", () => {
  it("accepts quoted or padded values pasted into secret forms", () => {
    expect(redisCredentials({ KV_REST_API_URL: ' "https://x.upstash.io" ', KV_REST_API_TOKEN: "'tok'" } as never)).toEqual({ url: "https://x.upstash.io", token: "tok" });
  });
  it("names the mistake when the redis:// connection string is used", () => {
    expect(() => redisCredentials({ KV_REST_API_URL: "rediss://default:secret@x.upstash.io:6379", KV_REST_API_TOKEN: "t" } as never)).toThrow(/redis:\/\/ connection string/);
  });
  it("never puts the value in the error", () => {
    try {
      redisCredentials({ KV_REST_API_URL: "secret-value", KV_REST_API_TOKEN: "t" } as never);
    } catch (e) {
      expect(String(e)).not.toContain("secret-value");
    }
  });
  it("returns null without credentials", () => {
    expect(redisCredentials({} as never)).toBeNull();
  });
});
