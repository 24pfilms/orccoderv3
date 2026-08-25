// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BoardExportMenu } from "./BoardExportMenu";

it("offers every local export format through a keyboard-visible menu", () => {
  const onExport = vi.fn();
  render(<BoardExportMenu disabled={false} onExport={onExport} />);
  const trigger = screen.getByRole("button", { name: "Export" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
    "PNG",
    "JPG",
    "PDF",
    "CSV",
  ]);
  fireEvent.click(screen.getByRole("menuitem", { name: "PDF" }));
  expect(onExport).toHaveBeenCalledWith("pdf");
});
