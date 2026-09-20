import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseSkillFile } from "./skills.js";

export interface CustomCommand {
  name: string;
  description: string;
  prompt: string;
  filePath: string;
}

/**
 * Load ~/.gg/commands/*.md and {cwd}/.gg/commands/*.md.
 * Project commands override global commands with the same resolved name.
 * Each .md file becomes a slash command. Frontmatter provides name/description,
 * and the body becomes the prompt injected into the agent.
 */
export async function loadCustomCommands(
  cwd: string,
  homeDir: string = os.homedir(),
): Promise<CustomCommand[]> {
  const globalDir = path.resolve(homeDir, ".gg", "commands");
  const projectDir = path.resolve(cwd, ".gg", "commands");
  // Order matters: project definitions overwrite global ones of the same name.
  const sources: Array<[string, string]> =
    globalDir === projectDir
      ? [[projectDir, ".gg/commands"]]
      : [
          [globalDir, "~/.gg/commands"],
          [projectDir, ".gg/commands"],
        ];
  const commands = new Map<string, CustomCommand>();
  for (const [dir, label] of sources) {
    for (const command of await loadCommandsFromDir(dir, label)) {
      // Call sites resolve a typed command by exact name, so key on the exact
      // name rather than folding case.
      commands.set(command.name, command);
    }
  }
  return [...commands.values()];
}

async function loadCommandsFromDir(
  commandsDir: string,
  label: string,
): Promise<CustomCommand[]> {
  const commands: CustomCommand[] = [];

  let files: string[];
  try {
    files = (await fs.readdir(commandsDir)).sort();
  } catch {
    return commands;
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const filePath = path.join(commandsDir, file);

    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = parseSkillFile(raw, label);
      const name = parsed.name || path.basename(file, ".md");
      commands.push({
        name,
        description: parsed.description || `Custom command from ${label}/${file}`,
        prompt: parsed.content,
        filePath,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return commands;
}
