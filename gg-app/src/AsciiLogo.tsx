import appPackage from "../package.json";
import orcaLogo from "./assets/orca-scarlet.png";

interface Props {
  folderSet?: boolean;
  providerCount?: number;
  serving?: boolean;
}

/** OrcaCoder's Scarlet hero card. The export name stays stable for upstream merges. */
export function AsciiLogo({
  folderSet = false,
  providerCount = 0,
  serving = false,
}: Props): React.ReactElement {
  const versionLabel = `V ${appPackage.version}`;

  return (
    <section className="ascii-logo scarlet-hero-card" aria-label={`OrcaCoder ${versionLabel}`}>
      <div className="scarlet-orca-well" aria-hidden="true">
        <img className="orca-logo" src={orcaLogo} alt="" />
      </div>
      <div className="orca-brand-title">OrcaCoder</div>
      <div className="orca-brand-version">{versionLabel}</div>
      <div className="scarlet-eyebrow">Pod Command Deck</div>
      <div className="scarlet-subcopy">Pod systems tuned for deep-work missions.</div>
      <div className="scarlet-status-pills" aria-label="System status">
        <span>Project waters: {folderSet ? "set" : "unset"}</span>
        <span>AI providers: {providerCount}</span>
        <span className="scarlet-pill-muted">Remote signal: {serving ? "live" : "standby"}</span>
      </div>
    </section>
  );
}
