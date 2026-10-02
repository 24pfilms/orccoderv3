import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as GgAiModule from "@kenkaiiii/gg-ai";

const streamMock = vi.hoisted(() => vi.fn());

vi.mock("@kenkaiiii/gg-ai", async () => {
  const actual = await vi.importActual<typeof GgAiModule>("@kenkaiiii/gg-ai");
  return { ...actual, stream: streamMock };
});

const { enhancePrompt } = await import("./prompt-enhancer.js");

function resolvedStream(text: string) {
  const response = Promise.resolve({ message: { role: "assistant", content: text } });
  return Object.assign(response, { response });
}

beforeEach(() => {
  streamMock.mockReset();
  streamMock.mockImplementation(() => resolvedStream("Fix the bug."));
});

describe("enhancePrompt request options", () => {
  it("forwards the Claude Code user agent so Anthropic OAuth serves newer models", async () => {
    // Regression: without the live UA the provider fell back to a stale
    // claude-cli version and Anthropic rejected Opus 5.5 ("Claude Code 2.1.75
    // does not support this model").
    await enhancePrompt({
      provider: "anthropic",
      model: "claude-opus-5-5",
      prompt: "fix bug",
      apiKey: "token",
      userAgent: "claude-cli/2.1.280 (external, cli)",
    });

    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        model: "claude-opus-5-5",
        userAgent: "claude-cli/2.1.280 (external, cli)",
      }),
    );
  });

  it("forwards the Google project id for Gemini OAuth", async () => {
    await enhancePrompt({
      provider: "gemini",
      model: "gemini-3.1-pro-preview",
      prompt: "fix bug",
      apiKey: "token",
      projectId: "test-google-project",
    });

    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "gemini", projectId: "test-google-project" }),
    );
  });
});
