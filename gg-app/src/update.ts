import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactElement, ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { error as logError } from "@tauri-apps/plugin-log";

export type UpdatePhase =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "installing"
  | "relaunching"
  | "updated"
  | "check-error"
  | "install-error";

export interface UpdateInfo {
  phase: UpdatePhase;
  version: string | null;
  notes: string | null;
  progress: number | null;
  error: string | null;
  blockers: string[];
  configured: boolean;
  check: () => Promise<void>;
  install: () => Promise<void>;
  dismissUpdated: () => Promise<void>;
}

const INITIAL_STATE: Omit<UpdateInfo, "check" | "install" | "dismissUpdated"> = {
  phase: "disabled",
  version: null,
  notes: null,
  progress: null,
  error: null,
  blockers: [],
  configured: false,
};

const UpdateContext = createContext<UpdateInfo | null>(null);

export function AppUpdateProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;
    void invoke<typeof INITIAL_STATE>("update_state")
      .then((snapshot) => {
        if (!cancelled) setState(snapshot);
      })
      .catch((error) => logError(`Update state failed: ${String(error)}`));
    const unlisten = listen<typeof INITIAL_STATE>("app-update-state", (event) => {
      if (!cancelled) setState(event.payload);
    });
    return () => {
      cancelled = true;
      void unlisten.then((stop) => stop());
    };
  }, []);

  const check = useCallback(async (): Promise<void> => {
    try {
      setState(await invoke<typeof INITIAL_STATE>("update_check"));
    } catch (error) {
      logError(`Update check failed: ${String(error)}`);
    }
  }, []);

  const install = useCallback(async (): Promise<void> => {
    const version = state.version ?? "the new version";
    const approved = await confirm(
      `Install OrcaCoder ${version} and restart all OrcaCoder windows?`,
      { title: "Install update", kind: "info" },
    );
    if (!approved) return;
    try {
      await invoke("update_install");
    } catch (error) {
      logError(`Update install failed: ${String(error)}`);
    }
  }, [state.version]);

  const dismissUpdated = useCallback(async (): Promise<void> => {
    try {
      setState(await invoke<typeof INITIAL_STATE>("update_dismiss_updated"));
    } catch (error) {
      logError(`Update success dismissal failed: ${String(error)}`);
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, check, install, dismissUpdated }),
    [state, check, install, dismissUpdated],
  );
  return createElement(UpdateContext.Provider, { value }, children);
}

export function useAppUpdate(): UpdateInfo {
  const update = useContext(UpdateContext);
  if (!update) throw new Error("useAppUpdate must be used inside AppUpdateProvider");
  return update;
}

export async function reportUpdateReadiness(blockers: string[]): Promise<void> {
  try {
    await invoke("update_set_window_readiness", { blockers });
  } catch (error) {
    logError(`Update readiness report failed: ${String(error)}`);
  }
}
