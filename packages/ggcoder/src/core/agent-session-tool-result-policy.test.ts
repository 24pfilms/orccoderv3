import { describe, expect, it } from "vitest";
import {
  resolveSessionToolResultCharLimit,
  resolveSessionTurnToolResultCharLimit,
} from "./agent-session.js";

describe("AgentSession tool-result policy", () => {
  it("passes the Codex 10k-token approximation for OpenAI OAuth sessions", () => {
    expect(resolveSessionToolResultCharLimit("gpt-6-sol", "openai", "acct_123")).toBe(40_000);
  });

  it("retains the generic context-relative allowance for other transports", () => {
    // Claude serves 200K without the context-1m beta → 200K × 1.05.
    expect(resolveSessionToolResultCharLimit("claude-sonnet-5", "anthropic", "acct_123")).toBe(
      210_000,
    );
    expect(resolveSessionToolResultCharLimit("gpt-6-sol", "openai")).toBe(1_102_500);
  });
});

describe("AgentSession per-turn tool-result budget", () => {
  it("scales with the context window at 15% of context chars", () => {
    // claude-sonnet-5: served 200K window → 15% × 200K × 3.5 chars, between
    // the 100K floor and 240K ceiling.
    expect(resolveSessionTurnToolResultCharLimit("claude-sonnet-5", "anthropic", "acct_123")).toBe(
      105_000,
    );
    // OpenAI public API gpt-6-sol: 15% of ctx*3.5, within floor/ceiling.
    const publicApi = resolveSessionTurnToolResultCharLimit("gpt-6-sol", "openai");
    expect(publicApi).toBeGreaterThanOrEqual(100_000);
    expect(publicApi).toBeLessThanOrEqual(240_000);
  });

  it("floors at 100KB so small windows still allow two full-size reads", () => {
    expect(
      resolveSessionTurnToolResultCharLimit("unknown-model", "openai", "acct_123"),
    ).toBeGreaterThanOrEqual(100_000);
  });
});
