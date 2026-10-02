// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardManager } from "./BoardManager";

const boards = [
  { boardId: "one", name: "One", description: null, revision: 0, updatedAt: "0", deletedAt: null },
  { boardId: "two", name: "Two", description: null, revision: 0, updatedAt: "0", deletedAt: null },
];

describe("BoardManager", () => {
  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  });

  it("opens a searchable modal, switches boards, and hides creation until requested", () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: showModal,
    });
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    render(
      <BoardManager boards={boards} selectedBoardId="one" disabled={false} onSelect={onSelect} onCreate={onCreate} onRename={vi.fn()} />,
    );
    expect(screen.queryByLabelText("Board name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /One/ }));
    expect(screen.getByRole("dialog", { name: "Boards" })).toBeTruthy();
    expect(showModal).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByPlaceholderText("Search boards"), { target: { value: "Two" } });
    const list = screen.getByRole("list", { name: "Available boards" });
    expect(within(list).queryByRole("button", { name: /One/ })).toBeNull();
    // Each row now also carries a "Rename …" button, so target the open button.
    fireEvent.click(within(list).getByRole("button", { name: /^Two/ }));
    expect(onSelect).toHaveBeenCalledWith("two");

    fireEvent.click(screen.getByRole("button", { name: /One/ }));
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    fireEvent.change(screen.getByLabelText("Board name"), { target: { value: "Roadmap" } });
    fireEvent.click(screen.getByRole("button", { name: "Create board" }));
    expect(onCreate).toHaveBeenCalledWith("Roadmap");
  });
});
