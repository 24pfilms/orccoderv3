// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { boardToCsv, encodeBoardExport, jpegToPdf, renderBoardCanvas } from "./export";
import type { BoardDocument } from "./repository";

const document: BoardDocument = {
  board: {
    boardId: "board",
    name: "Export",
    description: null,
    revision: 1,
    updatedAt: "0",
    deletedAt: null,
  },
  backgroundColor: "#101216",
  dotDensity: 16,
  toolbarPosition: "bottom",
  panX: 0,
  panY: 0,
  zoom: 1,
  items: [
    {
      itemId: "note",
      boardId: "board",
      itemType: "sticky_note",
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      zIndex: 0,
      rotation: 0,
      payload: { text: 'one, "two"' },
      revision: 0,
      createdAt: "0",
      updatedAt: "0",
      deletedAt: null,
    },
  ],
};

function parseCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"' && quoted && row[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += character;
  }
  cells.push(cell);
  return cells;
}

afterEach(() => vi.restoreAllMocks());

describe("Board export serialization", () => {
  it("writes stable escaped CSV rows", () => {
    const csv = new TextDecoder().decode(boardToCsv(document));
    const row = parseCsvRow(csv.split("\r\n")[1]);
    expect(row.slice(0, 8)).toEqual(["note", "sticky_note", "1", "2", "3", "4", "0", "0"]);
    expect(JSON.parse(row[8])).toEqual({ text: 'one, "two"' });
  });

  it("requests local browser encoders for PNG and JPG", async () => {
    const types: string[] = [];
    const context = new Proxy(
      { measureText: () => ({ width: 1 }) },
      { get: (target, key) => Reflect.get(target, key) ?? (() => {}) },
    ) as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback: BlobCallback, type?: string) => {
        types.push(type ?? "");
        const bytes =
          type === "image/png"
            ? new Uint8Array([0x89, 0x50, 0x4e, 0x47])
            : new Uint8Array([0xff, 0xd8, 0xff]);
        callback({ arrayBuffer: async () => bytes.buffer } as Blob);
      },
    } as unknown as HTMLCanvasElement;
    vi.spyOn(window.document, "createElement").mockReturnValue(canvas);
    await encodeBoardExport(document, "png");
    await encodeBoardExport(document, "jpg");
    expect(types).toEqual(["image/png", "image/jpeg"]);
  });

  it("exports shared shape geometry, arrowheads, frame dashes, drawing paths, and rotation", async () => {
    const calls = {
      fill: vi.fn(), lineTo: vi.fn(), setLineDash: vi.fn(), rotate: vi.fn(),
    };
    const context = new Proxy(
      { measureText: () => ({ width: 1 }), ...calls },
      { get: (target, key) => Reflect.get(target, key) ?? (() => {}) },
    ) as unknown as CanvasRenderingContext2D;
    const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    vi.spyOn(window.document, "createElement").mockReturnValue(canvas);
    const item = document.items[0];
    await renderBoardCanvas({
      ...document,
      items: [
        { ...item, itemId: "shape", itemType: "shape", width: 100, height: 100, rotation: 15, payload: { shape: "hexagon" } },
        { ...item, itemId: "arrow", itemType: "arrow", width: 200, height: 50, payload: { shape: "double_arrow" } },
        { ...item, itemId: "frame", itemType: "frame", width: 200, height: 100, payload: { title: "Frame", childIds: ["shape"] } },
        { ...item, itemId: "drawing", itemType: "drawing", width: 20, height: 20, payload: { points: [{ x: 0, y: 0 }, { x: 20, y: 20 }] } },
      ],
    });
    expect(calls.fill).toHaveBeenCalled();
    expect(calls.lineTo).toHaveBeenCalled();
    expect(calls.setLineDash).toHaveBeenCalledWith([8, 6]);
    expect(calls.rotate).toHaveBeenCalledWith(expect.closeTo(Math.PI / 12));
  });

  it("wraps JPEG bytes in a structurally indexed one-page PDF", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 0xff, 0xd9]);
    const pdf = jpegToPdf(jpeg, 800, 600);
    const text = new TextDecoder().decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Subtype /Image /Width 800 /Height 600");
    expect(text.endsWith("%%EOF\n")).toBe(true);
    expect(Array.from(pdf).join(",")).toContain(Array.from(jpeg).join(","));
  });
});
