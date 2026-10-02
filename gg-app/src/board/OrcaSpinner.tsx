interface OrcaSpinnerProps {
  /** Omitted on the canvas, where the swimming orca is the whole message. */
  label?: string;
}

/**
 * Busy indicator for long board work (currently image generation).
 *
 * A thin track with an accent arc sweeping around it — the familiar "working" signal —
 * and an orca gliding inside. The silhouette leads with the tall swept dorsal fin and the
 * white eye patch, the two features that read as an orca rather than a generic fish at
 * small sizes. Motion is pure CSS so it keeps running while the main thread is busy, and
 * it collapses to a static mark under `prefers-reduced-motion`.
 */
export function OrcaSpinner({ label }: OrcaSpinnerProps = {}): React.ReactElement {
  return (
    <div className="orca-spinner" role="status" aria-live="polite">
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle className="orca-spinner-track" cx="28" cy="28" r="24" />
        <circle className="orca-spinner-arc" cx="28" cy="28" r="24" />
        <g className="orca-spinner-body">
          {/* Tail fluke */}
          <path d="M13 28l-5-4c-1-1-2 0-1 1l1 3-1 3c-1 1 0 2 1 1z" />
          {/* Body */}
          <path d="M13 28c2-4 8-7 15-7 6 0 11 2 14 5l3 2-3 2c-3 3-8 5-14 5-7 0-13-3-15-7z" />
          {/* Dorsal fin — tall and swept, the orca's signature */}
          <path d="M27 21l3-9c0-1 2-1 2 0l2 9c-2-1-5-1-7 0z" />
          {/* Pectoral fin */}
          <path d="M25 33l-3 6c-1 1 1 2 2 1l4-5z" />
          {/* Eye patch */}
          <ellipse className="orca-spinner-eye" cx="38" cy="26" rx="2.4" ry="1.5" />
        </g>
      </svg>
      {label ? <span>{label}</span> : null}
    </div>
  );
}
