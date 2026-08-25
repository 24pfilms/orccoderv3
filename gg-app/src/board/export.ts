import type { BoardDocument, BoardItem } from "./repository";
import { boundsForItems } from "./interactions/geometry";
import { readItemPayload } from "./items/itemPayload";
import { drawCanvasArrowheads, isLinearShape, traceBoardShape } from "./items/shapeGeometry";

export type BoardExportFormat = "png" | "jpg" | "pdf" | "csv";
const MAX_EXPORT_PIXELS = 32_000_000;
const MAX_EXPORT_EDGE = 16_384;

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.split('"').join('""')}"`;
}

export function boardToCsv(document: BoardDocument): Uint8Array {
  const rows = [
    ["item_id", "item_type", "x", "y", "width", "height", "rotation", "z_index", "payload"],
    ...document.items
      .filter(({ deletedAt }) => !deletedAt)
      .map((item) => [
        item.itemId,
        item.itemType,
        item.x,
        item.y,
        item.width,
        item.height,
        item.rotation,
        item.zIndex,
        item.payload,
      ]),
  ];
  return new TextEncoder().encode(
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n",
  );
}

function exportBounds(items: BoardItem[]) {
  const active = items.filter(({ deletedAt }) => !deletedAt);
  const content = active.length ? boundsForItems(active) : { x: 0, y: 0, width: 800, height: 600 };
  const padding = active.length ? 32 : 0;
  const minX = content.x - padding;
  const minY = content.y - padding;
  const worldWidth = Math.max(1, content.width + padding * 2);
  const worldHeight = Math.max(1, content.height + padding * 2);
  const scale = Math.min(
    1,
    MAX_EXPORT_EDGE / worldWidth,
    MAX_EXPORT_EDGE / worldHeight,
    Math.sqrt(MAX_EXPORT_PIXELS / (worldWidth * worldHeight)),
  );
  return {
    minX,
    minY,
    scale,
    width: Math.max(1, Math.ceil(worldWidth * scale)),
    height: Math.max(1, Math.ceil(worldHeight * scale)),
  };
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
) {
  let line = "";
  let lineY = y;
  for (const word of text.split(/(\s+)/)) {
    const next = line + word;
    if (line && context.measureText(next).width > width) {
      context.fillText(line.trimEnd(), x, lineY);
      line = word.trimStart();
      lineY += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) context.fillText(line.trimEnd(), x, lineY);
}

async function loadAuthorizedImage(assetId: string): Promise<HTMLImageElement> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(assetId)) throw new Error("Board asset ID is invalid");
  const image = new Image();
  image.decoding = "async";
  image.src = `board-asset://${encodeURIComponent(assetId)}`;
  await image.decode();
  return image;
}

async function renderItem(context: CanvasRenderingContext2D, item: BoardItem) {
  const payload = readItemPayload(item.payload);
  context.save();
  context.translate(item.x + item.width / 2, item.y + item.height / 2);
  context.rotate((item.rotation * Math.PI) / 180);
  context.translate(-item.width / 2, -item.height / 2);
  const color = typeof payload.color === "string" ? payload.color : "#f4f4f5";
  if (item.itemType === "sticky_note") {
    context.fillStyle = typeof payload.backgroundColor === "string" ? payload.backgroundColor : "#f6d365";
    context.fillRect(0, 0, item.width, item.height);
    context.fillStyle = "#202124";
    context.font = "15px sans-serif";
    drawText(
      context,
      typeof payload.text === "string" ? payload.text : "",
      12,
      24,
      item.width - 24,
      19,
    );
  } else if (item.itemType === "text") {
    const fontSize = typeof payload.fontSize === "number" ? payload.fontSize : 24;
    context.fillStyle = color;
    context.font = `${fontSize}px sans-serif`;
    drawText(
      context,
      typeof payload.text === "string" ? payload.text : "",
      0,
      fontSize,
      item.width,
      fontSize * 1.25,
    );
  } else if (item.itemType === "shape") {
    const shape = payload.shape ?? "rectangle";
    context.fillStyle = typeof payload.fill === "string" ? payload.fill : "#7db7ff";
    context.strokeStyle = typeof payload.stroke === "string" ? payload.stroke : "#345a88";
    context.lineWidth = 2;
    traceBoardShape(context, shape, item.width, item.height);
    if (!isLinearShape(shape)) context.fill();
    context.stroke();
    if (isLinearShape(shape)) drawCanvasArrowheads(context, shape, item.width, item.height);
    if (payload.text) {
      context.fillStyle = color;
      context.font = `${payload.fontSize ?? 14}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(payload.text, item.width / 2, item.height / 2, item.width - 12);
    }
  } else if (item.itemType === "frame") {
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.setLineDash([8, 6]);
    context.strokeRect(0, 0, item.width, item.height);
    context.setLineDash([]);
    context.fillStyle = color;
    context.font = "14px sans-serif";
    context.fillText(typeof payload.title === "string" ? payload.title : "Frame", 8, -7);
  } else if (item.itemType === "arrow") {
    const shape = payload.shape === "line" || payload.shape === "double_arrow" ? payload.shape : "arrow";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 3;
    traceBoardShape(context, shape, item.width, item.height);
    context.stroke();
    drawCanvasArrowheads(context, shape, item.width, item.height);
  } else if (item.itemType === "drawing") {
    const points = Array.isArray(payload.points) ? payload.points : [];
    context.strokeStyle = color;
    context.lineWidth = payload.strokeWidth ?? 3;
    context.lineCap = "round";
    context.beginPath();
    points.forEach((point, index) => {
      if (!point || typeof point !== "object") return;
      const { x, y } = point as { x?: unknown; y?: unknown };
      if (typeof x !== "number" || typeof y !== "number") return;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  } else if (item.itemType === "image" && typeof payload.assetId === "string") {
    const image = await loadAuthorizedImage(payload.assetId);
    const scale = Math.min(item.width / image.naturalWidth, item.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (item.width - width) / 2, (item.height - height) / 2, width, height);
  }
  context.restore();
}

export async function renderBoardCanvas(document: BoardDocument): Promise<HTMLCanvasElement> {
  const bounds = exportBounds(document.items);
  const canvas = window.document.createElement("canvas");
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable");
  context.fillStyle = document.backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(bounds.scale, bounds.scale);
  context.translate(-bounds.minX, -bounds.minY);
  for (const item of document.items.filter(({ deletedAt }) => !deletedAt)) {
    await renderItem(context, item);
  }
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Board export encoding failed"))),
      mimeType,
      quality,
    );
  });
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

export function jpegToPdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const encode = (text: string) => new TextEncoder().encode(text);
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  const objects = [
    encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    ),
    encode(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    joinBytes([
      encode(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      encode("\nendstream"),
    ]),
  ];
  const parts = [encode("%PDF-1.4\n%âãÏÓ\n")];
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(parts.reduce((total, part) => total + part.length, 0));
    parts.push(encode(`${index + 1} 0 obj\n`), object, encode("\nendobj\n"));
  }
  const xref = parts.reduce((total, part) => total + part.length, 0);
  parts.push(
    encode(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `)
        .join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  );
  return joinBytes(parts);
}

export async function encodeBoardExport(
  document: BoardDocument,
  format: BoardExportFormat,
): Promise<Uint8Array> {
  if (format === "csv") return boardToCsv(document);
  const canvas = await renderBoardCanvas(document);
  const blob = await canvasBlob(canvas, format === "png" ? "image/png" : "image/jpeg", 0.92);
  const image = new Uint8Array(await blob.arrayBuffer());
  return format === "pdf" ? jpegToPdf(image, canvas.width, canvas.height) : image;
}
