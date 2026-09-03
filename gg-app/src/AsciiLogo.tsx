import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import orcaLogo from "./assets/orca-scarlet.png";

interface Props {
  folderSet?: boolean;
  providerCount?: number;
  action?: React.ReactNode;
}

/** OrcaCoder's Scarlet hero card. The export name stays stable for upstream merges. */
export function AsciiLogo({
  folderSet = false,
  providerCount = 0,
  action,
}: Props): React.ReactElement {
  // The installed bundle version, not the source package version: an in-app
  // update replaces the binary without rebuilding this bundle's package.json.
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getVersion()
      .then((value) => {
        if (!cancelled) setVersion(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const versionLabel = version ? `V ${version}` : "";

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
      </div>
      {action && <div className="scarlet-update-slot">{action}</div>}
    </section>
  );
}
