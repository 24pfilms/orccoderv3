import { describe, expect, it } from "vitest";
import { boardAssetUrl, parseYouTubeUrl, youTubeEmbedUrl } from "./itemPayload";

const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebView2";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

describe("boardAssetUrl", () => {
  it("uses the localhost host form on Windows, which WebView2 can load", () => {
    expect(boardAssetUrl("abc-123", WINDOWS)).toBe("http://board-asset.localhost/abc-123");
  });

  it("uses the bare custom scheme elsewhere", () => {
    expect(boardAssetUrl("abc-123", MAC)).toBe("board-asset://abc-123");
  });

  it("rejects ids that are not plain asset identifiers", () => {
    expect(boardAssetUrl("../etc/passwd", WINDOWS)).toBeNull();
    expect(boardAssetUrl(42, WINDOWS)).toBeNull();
  });
});

describe("parseYouTubeUrl", () => {
  const cases = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=42", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ] as const;

  it.each(cases)("extracts the id from %s", (url, expected) => {
    expect(parseYouTubeUrl(url)).toBe(expected);
  });

  it("rejects non-YouTube and malformed links", () => {
    expect(parseYouTubeUrl("https://vimeo.com/12345")).toBeNull();
    expect(parseYouTubeUrl("https://youtu.be/tooshort")).toBeNull();
    expect(parseYouTubeUrl("not a url")).toBeNull();
  });

  it("builds an embed URL only for a well-formed id", () => {
    expect(youTubeEmbedUrl("dQw4w9WgXcQ")).toContain("/embed/dQw4w9WgXcQ");
    expect(youTubeEmbedUrl("../../evil")).toBeNull();
  });
});
