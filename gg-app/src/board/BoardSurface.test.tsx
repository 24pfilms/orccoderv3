// @vitest-environment jsdom
import { useEffect } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardSurface, WorkspaceSurface } from "./BoardSurface";
import { BoardFlushCoordinator } from "./flush";

afterEach(cleanup);

describe("Board surfaces", () => {
  it("adds no wrapper when Board Mode is disabled", () => {
    const { container } = render(
      <WorkspaceSurface boardEnabled={false} hidden={false}>
        <main>Workspace</main>
      </WorkspaceSurface>,
    );

    expect(container.firstElementChild?.tagName).toBe("MAIN");
    expect(container.querySelector(".workspace-surface")).toBeNull();
  });

  it("keeps the Workspace mounted but inert while Board Mode is active", () => {
    const { container } = render(
      <WorkspaceSurface boardEnabled hidden>
        <main>Workspace</main>
      </WorkspaceSurface>,
    );

    const workspace = container.querySelector(".workspace-surface");
    expect(workspace?.querySelector("main")).not.toBeNull();
    expect(workspace?.hasAttribute("hidden")).toBe(true);
    expect(workspace?.hasAttribute("inert")).toBe(true);
    expect(workspace?.getAttribute("aria-hidden")).toBe("true");
  });

  it("does not remount Workspace state across 100 surface toggles", () => {
    const mounted = vi.fn();
    const unmounted = vi.fn();
    function WorkspaceProbe(): React.ReactElement {
      useEffect(() => {
        mounted();
        return unmounted;
      }, []);
      return <main>Workspace</main>;
    }

    const { rerender } = render(
      <WorkspaceSurface boardEnabled hidden={false}>
        <WorkspaceProbe />
      </WorkspaceSurface>,
    );
    for (let toggle = 0; toggle < 100; toggle += 1) {
      rerender(
        <WorkspaceSurface boardEnabled hidden={toggle % 2 === 0}>
          <WorkspaceProbe />
        </WorkspaceSurface>,
      );
    }

    expect(mounted).toHaveBeenCalledOnce();
    expect(unmounted).not.toHaveBeenCalled();
    expect(screen.getByText("Workspace")).toBeDefined();
  });

  it("labels the empty Board surface", async () => {
    render(<BoardSurface flushCoordinator={new BoardFlushCoordinator(() => {})} />);
    expect(screen.getByRole("region", { name: "Board Mode" })).toBeDefined();
    expect(await screen.findAllByText("Board could not be loaded")).toHaveLength(2);
  });
});
