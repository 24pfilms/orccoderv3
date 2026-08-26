import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Radio, Volume2 } from "lucide-react";
import { theme } from "./theme";
import { getRadioState, setRadio, setRadioVolume, type RadioStation } from "./agent";
import { Modal } from "./Modal";

/** Titlebar control and modal player for the app-wide internet radio. */
export function RadioButton(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [selected, setSelected] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const [volume, setVolume] = useState(70);
  const [error, setError] = useState<string | null>(null);
  const volumeRef = useRef(70);
  const syncedVolumeRef = useRef(70);
  const volumeSaveRef = useRef(0);

  const applyState = useCallback((state: Awaited<ReturnType<typeof getRadioState>>): void => {
    setStations(state.stations);
    setCurrent(state.current);
    setSelected((previous) => state.current ?? (previous || state.stations[0]?.id || ""));
    volumeRef.current = state.volume;
    syncedVolumeRef.current = state.volume;
    setVolume(state.volume);
  }, []);

  useEffect(() => {
    void getRadioState().then(applyState);
  }, [applyState]);

  useEffect(() => {
    if (open) void getRadioState().then(applyState);
  }, [applyState, open]);

  function updateVolume(nextVolume: number): void {
    volumeRef.current = nextVolume;
    setVolume(nextVolume);
  }

  function saveVolume(): void {
    const nextVolume = volumeRef.current;
    const previousVolume = syncedVolumeRef.current;
    if (nextVolume === previousVolume) return;
    const saveId = ++volumeSaveRef.current;
    syncedVolumeRef.current = nextVolume;
    setError(null);
    void setRadioVolume(nextVolume)
      .then((saved) => {
        if (volumeSaveRef.current !== saveId) return;
        syncedVolumeRef.current = saved;
        if (volumeRef.current === nextVolume) updateVolume(saved);
      })
      .catch((reason: unknown) => {
        if (volumeSaveRef.current !== saveId) return;
        syncedVolumeRef.current = previousVolume;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }

  async function play(station: string): Promise<void> {
    if (busy || !station) return;
    setBusy(true);
    setError(null);
    try {
      setCurrent(await setRadio(station));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function togglePlayback(): Promise<void> {
    await play(current === null ? selected : "off");
  }

  function changeStation(station: string): void {
    setSelected(station);
    if (current !== null) void play(station);
  }

  const playing = current !== null;
  const selectedStation = stations.find((station) => station.id === selected);

  return (
    <>
      <button
        className="btn btn-ghost btn-sm btn-nav-icon"
        title={playing ? "Radio playing" : "Internet radio"}
        style={playing ? { color: theme.accent } : undefined}
        onClick={() => setOpen(true)}
      >
        <Radio size={16} />
      </button>
      {open && (
        <Modal title="Internet Radio" onClose={() => setOpen(false)} className="radio-modal">
          {/* A list, not a <select>. WebView2's native select popup opens but
              cannot commit a selection (the same defect that forced the model
              picker's in-webview menu), so the station picker was unusable on
              Windows. Ten hand-picked stations also read better as rows that
              show their description than as names hidden behind a dropdown. */}
          <ul className="radio-stations" aria-label="Stations">
            {stations.map((station) => {
              const isSelected = station.id === selected;
              const isPlaying = station.id === current;
              return (
                <li key={station.id}>
                  <button
                    type="button"
                    className="radio-station"
                    data-selected={isSelected || undefined}
                    data-playing={isPlaying || undefined}
                    aria-pressed={isSelected}
                    disabled={busy}
                    onClick={() => changeStation(station.id)}
                    onDoubleClick={() => void play(station.id)}
                  >
                    <span className="radio-station-text">
                      <strong>{station.name}</strong>
                      <span>{station.description}</span>
                    </span>
                    {isPlaying ? (
                      // Three bars rather than a label: it reads at a glance and
                      // does not reflow the row when playback starts or stops.
                      <span className="radio-bars" aria-label="Now playing">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
            {stations.length === 0 ? (
              <li className="radio-stations-empty">No stations available.</li>
            ) : null}
          </ul>

          <div className="radio-player-row">
            <button
              className="modal-btn primary radio-play-button"
              disabled={busy || !selected}
              title={selectedStation ? `${playing ? "Stop" : "Play"} ${selectedStation.name}` : ""}
              onClick={() => void togglePlayback()}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
              {playing ? "Stop" : "Play"}
            </button>
            <span className="radio-now" style={{ color: theme.textDim }}>
              {playing ? selectedStation?.name : "Nothing playing"}
            </span>
          </div>

          <div className="radio-volume-heading">
            <label className="modal-label" style={{ color: theme.textMuted }}>
              Volume
            </label>
            <span style={{ color: theme.textDim }}>{volume}%</span>
          </div>
          <div className="radio-volume-row">
            <Volume2 size={17} color={theme.textMuted} />
            <div className="radio-volume-slider">
              <div className="radio-volume-track">
                <div className="radio-volume-fill" style={{ width: `${volume}%` }} />
              </div>
              <input
                className="radio-volume-input"
                type="range"
                min="0"
                max="100"
                value={volume}
                aria-label="Radio volume"
                onChange={(event) => updateVolume(Number(event.target.value))}
                onPointerUp={saveVolume}
                onPointerCancel={saveVolume}
                onKeyUp={saveVolume}
                onBlur={saveVolume}
              />
            </div>
          </div>

          {error && (
            <div className="modal-hint" style={{ color: theme.error }}>
              {error}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
