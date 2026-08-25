// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardErrorBoundary } from "./BoardErrorBoundary";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function BrokenBoard(): React.ReactElement {
  throw new Error("private board text at C:\\Users\\person\\project");
}

describe("BoardErrorBoundary", () => {
  it("offers a Workspace fallback with a privacy-safe diagnostic", () => {
    const onFailure = vi.fn();
    const onReturnToWorkspace = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <BoardErrorBoundary onFailure={onFailure} onReturnToWorkspace={onReturnToWorkspace}>
        <BrokenBoard />
      </BoardErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Your workspace and agent session are still running.")).toBeDefined();
    expect(screen.getByText("board-render-failed:Error")).toBeDefined();
    expect(screen.queryByText(/private board text|Users|project/)).toBeNull();
    expect(onFailure).toHaveBeenCalledWith({
      code: "board-render-failed",
      errorType: "Error",
    });

    fireEvent.click(screen.getByRole("button", { name: "Return to Workspace" }));
    expect(onReturnToWorkspace).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
