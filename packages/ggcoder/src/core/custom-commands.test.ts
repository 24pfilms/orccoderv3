import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCustomCommands } from "./custom-commands.js";

let scratch: string;
let home: string;
let cwd: string;

const write = async (root: string, file: string, body: string): Promise<void> => {
  const dir = path.join(root, ".gg", "commands");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), body);
};

beforeEach(async () => {
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), "gg-commands-"));
  home = path.join(scratch, "home");
  cwd = path.join(scratch, "project");
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(cwd, { recursive: true });
});

afterEach(async () => {
  await fs.rm(scratch, { recursive: true, force: true });
});

describe("loadCustomCommands", () => {
  it("loads global commands for a project that has none", async () => {
    await write(home, "steroids.md", "---\nname: steroids\ndescription: Corpus research\n---\n\nSearch the corpus.");

    const commands = await loadCustomCommands(cwd, home);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe("steroids");
    expect(commands[0].prompt).toBe("Search the corpus.");
  });

  it("merges global and project commands", async () => {
    await write(home, "steroids.md", "---\nname: steroids\n---\n\nGlobal body.");
    await write(cwd, "deploy.md", "---\nname: deploy\n---\n\nProject body.");

    const names = (await loadCustomCommands(cwd, home)).map((c) => c.name).sort();

    expect(names).toEqual(["deploy", "steroids"]);
  });

  it("lets a project command override a global one of the same name", async () => {
    await write(home, "steroids.md", "---\nname: steroids\ndescription: Global\n---\n\nGlobal body.");
    await write(cwd, "steroids.md", "---\nname: steroids\ndescription: Project\n---\n\nProject body.");

    const commands = await loadCustomCommands(cwd, home);

    expect(commands).toHaveLength(1);
    expect(commands[0].description).toBe("Project");
    expect(commands[0].prompt).toBe("Project body.");
  });

  it("does not duplicate commands when the project is the home directory", async () => {
    await write(home, "steroids.md", "---\nname: steroids\n---\n\nBody.");

    const commands = await loadCustomCommands(home, home);

    expect(commands).toHaveLength(1);
  });

  it("returns nothing when neither directory exists", async () => {
    expect(await loadCustomCommands(cwd, path.join(scratch, "absent"))).toEqual([]);
  });

  it("falls back to a description naming the directory the file came from", async () => {
    await write(home, "global-only.md", "Global body.");
    await write(cwd, "project-only.md", "Project body.");

    const byName = new Map((await loadCustomCommands(cwd, home)).map((c) => [c.name, c.description]));

    expect(byName.get("global-only")).toBe("Custom command from ~/.gg/commands/global-only.md");
    expect(byName.get("project-only")).toBe("Custom command from .gg/commands/project-only.md");
  });
});
