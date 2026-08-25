import { describe, expect, it } from "vitest";
import { boardAssetUrl } from "./itemPayload";

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
