export interface BoardKeyboardCommands {
  undo: () => void;
  redo: () => void;
  duplicate: () => void;
  copy: () => void;
  paste: () => void;
  deleteSelection: () => void;
  escape: () => void;
}

function isEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function handleBoardKeyDown(
  event: KeyboardEvent,
  commands: BoardKeyboardCommands,
): boolean {
  if (isEditingTarget(event.target)) return false;
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  let command: (() => void) | undefined;
  if (key === "escape") command = commands.escape;
  else if (key === "delete" || key === "backspace") command = commands.deleteSelection;
  else if (modifier && key === "d") command = commands.duplicate;
  else if (modifier && key === "c") command = commands.copy;
  else if (modifier && key === "v") command = commands.paste;
  else if (modifier && key === "z" && event.shiftKey) command = commands.redo;
  else if (modifier && key === "z") command = commands.undo;
  else if (modifier && key === "y") command = commands.redo;
  if (!command) return false;
  event.preventDefault();
  command();
  return true;
}
