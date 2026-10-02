import { describe, expect, it } from "vitest";
import capability from "../src-tauri/capabilities/default.json";

describe("ActivityWatch native title permission", () => {
  it("allows workspace windows to publish their project title", () => {
    expect(capability.windows).toEqual(expect.arrayContaining(["main", "project-*"]));
    expect(capability.permissions).toContain("core:window:allow-set-title");
  });
});
