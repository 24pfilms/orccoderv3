/** Folder name of Orca Motion's video workspace inside the projects root. */
export const MOTION_FOLDER_NAME = "Orca Motion";

/** Orca Motion's workspace path, joined with the projects root's own separator. */
export function motionWorkspacePath(projectsRoot: string): string {
  const sep = projectsRoot.includes("\\") && !projectsRoot.includes("/") ? "\\" : "/";
  const root = projectsRoot.replace(/[\\/]+$/, "");
  return `${root}${sep}${MOTION_FOLDER_NAME}`;
}
