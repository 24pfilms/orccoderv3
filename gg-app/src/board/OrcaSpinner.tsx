interface OrcaSpinnerProps {
  label: string;
}

/**
 * Busy indicator for long board work (currently image generation).
 *
 * A side-on orca gliding through a ring of water. The ring gives the familiar
 * "something is happening" affordance; the orca makes it ours. Motion is pure CSS so it
 * keeps animating while the main thread is busy, and it collapses to a static mark under
 * `prefers-reduced-motion`.
 */
export function OrcaSpinner({ label }: OrcaSpinnerProps): React.ReactElement {
  return (
    <div className="orca-spinner" role="status" aria-live="polite">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="orca-spinner-ring" cx="32" cy="32" r="26" />
        <g className="orca-spinner-body">
          {/* Body, dorsal fin and tail fluke as one silhouette. */}
          <path
            d="M13 34c4-7 12-11 20-11 4 0 7 1 10 3l4-9 1 11c3 2 5 5 6 8-4 4-11 7-19 7-9 0-17-3-22-9z"
            fill="currentColor"
          />
          <path d="M11 34l-7-6 1 7-1 7 7-6z" fill="currentColor" />
          {/* Eye patch — the detail that makes it read as an orca rather than a fish. */}
          <ellipse cx="24" cy="29" rx="3.4" ry="2.1" fill="#fff" opacity="0.9" />
        </g>
      </svg>
      <span>{label}</span>
    </div>
  );
}
