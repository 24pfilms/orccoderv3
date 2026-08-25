// @vitest-environment jsdom
import { beforeEach, expect, test } from "vitest";
import {
  loadState,
  saveState,
  setAttentionEnabled,
  setAttentionOverride,
  setAttentionTheme,
  subscribeToThemeChanges,
  type OrcaThemeState,
} from "./orca-theme";

const state: OrcaThemeState = {
  theme: "ocean",
  brightness: 70,
  saturation: 139,
  glass: 53,
  attentionEnabled: true,
  attentionTheme: "scarlet",
};

beforeEach(() => {
  localStorage.clear();
  saveState(state);
  setAttentionOverride(false);
});

test("temporarily applies the attention palette without replacing the saved palette", () => {
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#67e8f9");

  setAttentionOverride(true);
  expect(document.documentElement.hasAttribute("data-orca-attention")).toBe(true);
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#ef4444");
  expect(loadState()).toEqual(state);

  setAttentionOverride(false);
  expect(document.documentElement.hasAttribute("data-orca-attention")).toBe(false);
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#67e8f9");
});

test("can disable the attention override", () => {
  setAttentionOverride(true);
  setAttentionEnabled(false);

  expect(document.documentElement.hasAttribute("data-orca-attention")).toBe(false);
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#67e8f9");
  expect(loadState().attentionEnabled).toBe(false);

  setAttentionOverride(false);
});

test("can choose a different attention palette", () => {
  setAttentionOverride(true);
  setAttentionTheme("arctic");

  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#93c5fd");
  expect(loadState().attentionTheme).toBe("arctic");

  setAttentionOverride(false);
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#67e8f9");
});

test("synchronizes the selected attention palette from another window", () => {
  setAttentionOverride(true);
  let syncedTheme = "";
  const unsubscribe = subscribeToThemeChanges((next) => {
    syncedTheme = next.attentionTheme;
  });

  saveState({ ...state, attentionTheme: "obsidian" });
  window.dispatchEvent(new StorageEvent("storage", { key: "orcacoder-v3-appearance-scarlet-v1" }));

  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#a1a1aa");
  expect(syncedTheme).toBe("obsidian");

  unsubscribe();
  setAttentionOverride(false);
});
