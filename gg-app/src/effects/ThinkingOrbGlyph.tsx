import { ThinkingOrb } from "thinking-orbs";
import { useGgUiEnabled } from "./gg-ui";

// [effects] The animated thinking orb, shown in place of a caller-supplied
// fallback (e.g. the braille spinner) while the effects toggle is on. Routing
// the `thinking-orbs` dependency through here keeps every effect import under
// effects/ — see effects/README.md for removal.
export function ThinkingOrbGlyph({
  fallback,
}: {
  fallback: React.ReactNode;
}): React.ReactElement {
  const on = useGgUiEnabled();
  if (!on) return <>{fallback}</>;
  return (
    <ThinkingOrb
      state="listening"
      size={20}
      theme="dark"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    />
  );
}
