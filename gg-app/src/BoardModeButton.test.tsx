// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardModeButton } from "./BoardModeButton";

afterEach(cleanup);

describe("BoardModeButton", () => {
  it("switches from Workspace to Board", () => {
    const onChange = vi.fn();
    render(<BoardModeButton surface="workspace" onChange={onChange} />);

    const button = screen.getByRole("button", { name: "Board" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith("board");
  });

  it("switches from Board to Workspace", () => {
    const onChange = vi.fn();
    render(<BoardModeButton surface="board" onChange={onChange} />);

    const button = screen.getByRole("button", { name: "Workspace" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith("workspace");
  });
});
