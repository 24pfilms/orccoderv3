import { lazy, Suspense } from "react";

// [effects] Lazy-loaded so the border-beam chunk never loads unless a beam
// actually renders. The caller gates `active` on both "is running" AND
// useGgUiEnabled(), so an off toggle means this stays null and requests nothing.
const BorderBeam = lazy(() =>
  import("border-beam").then((module) => ({ default: module.BorderBeam })),
);

/** Decorative overlay: never wraps or remounts the editable field or its controls. */
export function WorkingBeam({
  active,
  size = "md",
}: {
  active: boolean;
  size?: "md" | "sm";
}): React.ReactElement | null {
  if (!active) return null;

  return (
    <Suspense fallback={null}>
      <BorderBeam
        className={`working-beam working-beam-${size}`}
        size={size}
        colorVariant="colorful"
        strength={0.7}
        theme="dark"
        aria-hidden="true"
      >
        <div className="working-beam-surface" />
      </BorderBeam>
    </Suspense>
  );
}
