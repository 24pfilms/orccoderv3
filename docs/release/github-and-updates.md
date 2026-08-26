# How OrcaCoder uses GitHub, and how updates reach a machine

**Written:** 26 August 2026
**For:** anyone picking up this project who needs to push work or ship a new version.

Read this before your first push. One step here is easy to get wrong, and the
mistake is quiet — it looks like it worked.

---

## 1. There are three GitHub repositories

This project has three remotes. A remote is a nickname for a repository on
GitHub. Run `git remote -v` to see them.

| Nickname   | Repository                  | What it is                          | Do you push to it? |
| ---------- | --------------------------- | ----------------------------------- | ------------------ |
| `mero`     | `24pfilms/OrcaCoder_Mero`   | Where current work goes             | **Yes**            |
| `origin`   | `24pfilms/orccoderv3`       | Older repository, no longer current | No                 |
| `upstream` | `KenKaiii/gg-framework`     | The MIT project this was built from | **Never**          |

`upstream` belongs to someone else. It is there so we can pull their changes in.
Pushing to it would send our private work to another person's project.

### The one that catches people

The local branch is called `test/updater-pipeline`. Git thinks that branch
belongs to `origin`, because that is where it was first created. But we stopped
using `origin` and moved to `mero`.

So typing `git push` on its own sends your work to `origin` — the old
repository. It will succeed. It will print no warning. Your work will simply not
be where anyone expects it.

**Always name the target:**

```bash
git push mero HEAD:main
```

Read that as: push what I am on now to the branch called `main` on `mero`.

As of 26 August 2026, `origin` is 34 commits behind and we are not catching it
up. Treat it as history.

### Checking before you push

```bash
git fetch mero main && git log --oneline mero/main..HEAD
```

That lists exactly the commits you are about to send. If it lists something you
did not write, stop and find out why.

---

## 2. There is no automatic updating

Many desktop apps check a server and update themselves. **OrcaCoder does not.**
The code for it exists but is switched off. In
`gg-app/src-tauri/tauri.conf.json`:

```json
"updater": { "pubkey": "", "endpoints": [], ... }
"createUpdaterArtifacts": false
```

`endpoints` is empty, so there is no server to ask. `pubkey` is empty, so there
is no signing key to prove a download is genuine. Both are needed before
automatic updates can be turned on, and neither exists yet.

**What this means in practice:** an update reaches a machine because a person
builds an installer and copies it there. Nothing happens on its own. Pushing to
GitHub does not update anybody's app.

Keep these two ideas apart:

- **GitHub stores the source code.** Pushing shares the code.
- **The installer is a file you build and carry.** That is what updates an app.

---

## 3. Making a change and sharing the code

1. Make the change.
2. Run the tests:
   ```bash
   cd gg-app && pnpm test
   ```
3. Commit it. One idea per commit. Write what changed and why.
4. Push it:
   ```bash
   git push mero HEAD:main
   ```

Do not push code you have not run.

---

## 4. Building an installer

Follow these in order. Step 2 is the one that gets skipped.

**1. Build the sidecar's source, if you changed it.**

The sidecar is the background program that does the real work. It lives in
`packages/ggcoder`. The app loads it from a compiled folder called `dist`, not
from the source, so the source must be compiled first.

```bash
cd packages/ggcoder && pnpm build
```

**2. Bundle the sidecar into the app.**

```bash
cd gg-app && pnpm prebundle
```

**This step is not automatic.** The build only runs `pnpm build`, which compiles
the interface and nothing else. If you skip `prebundle`, the installer is built
with whatever sidecar was bundled last time, and your change is missing. The
build still reports success.

**3. Build the installer.**

```bash
cd gg-app && VITE_BOARD_MODE_ENABLED=true pnpm tauri build
```

`VITE_BOARD_MODE_ENABLED=true` switches Board Mode on. This is fixed when the
installer is built and cannot be changed afterwards. Leave it out and the
finished app has no Board Mode at all.

Expect several minutes. The result:

```
gg-app/src-tauri/target/release/bundle/nsis/OrcaCoder_<version>_x64-setup.exe
gg-app/src-tauri/target/release/bundle/msi/OrcaCoder_<version>_x64_en-US.msi
```

Use the `nsis` one — that is the normal installer. The `msi` is for company
machines managed by an IT department.

### Always check the installer is new

A build can report success and produce nothing. This has happened. Check the
date and time on the file:

```bash
ls -l gg-app/src-tauri/target/release/bundle/nsis/
```

If the timestamp is not from the last few minutes, the build did not run. Do not
trust the success message on its own.

### Changing the version number

Four files hold the version and must match. One command updates all four:

```bash
cd gg-app && node scripts/bump-version.mjs patch
```

Use `patch` for a fix, `minor` for a new feature, or type a version such as
`0.54.0`. Do this before building, so the installer's filename carries the new
number. The version on 26 August 2026 was `0.53.0`.

---

## 5. Installing on another machine

1. Copy the `.exe` from the `nsis` folder to the other machine.
2. Run it.
3. Windows will show a blue warning box that says it protected your PC. Click
   **More info**, then **Run anyway**.

The warning appears because the installer is unsigned. Signing requires a
certificate the project does not have yet. It is not a sign that anything is
wrong with the file, but it does mean Windows cannot confirm who made it.

### What carries over and what does not

Your settings and logins are **not** inside the installer. They live in a folder
in your user account:

```
C:\Users\<you>\.gg\
```

That folder holds `auth.json` (your OAuth logins) and `api-keys.json`. It stays
where it is when you install, update, or uninstall. That is why a fresh install
on a machine you have used before already knows who you are.

It also means:

- Each machine has its own settings. A choice made on one does not appear on the
  other.
- **Never copy the `.gg` folder to another machine or into a shared file.** It
  contains your logins. Sharing it is the same as sharing your accounts.
- The installer itself contains no logins and is safe to give to other people.
  They will sign in with their own.

---

## 6. Quick reference

| Task                        | Command                                             |
| --------------------------- | --------------------------------------------------- |
| See what you would push     | `git log --oneline mero/main..HEAD`                 |
| Push your work              | `git push mero HEAD:main`                           |
| Run the tests               | `cd gg-app && pnpm test`                            |
| Compile the sidecar source  | `cd packages/ggcoder && pnpm build`                 |
| Bundle the sidecar          | `cd gg-app && pnpm prebundle`                       |
| Build the installer         | `cd gg-app && VITE_BOARD_MODE_ENABLED=true pnpm tauri build` |
| Raise the version number    | `cd gg-app && node scripts/bump-version.mjs patch`  |

---

## 7. Mistakes to avoid

1. **Typing `git push` with nothing after it.** It goes to the old repository and
   does not warn you.
2. **Pushing to `upstream`.** That repository belongs to someone else.
3. **Skipping `pnpm prebundle`.** Your sidecar changes will not be in the
   installer, and the build will still say it succeeded.
4. **Leaving out `VITE_BOARD_MODE_ENABLED=true`.** The finished app will have no
   Board Mode, and it cannot be switched on afterwards.
5. **Believing a build worked because it said so.** Check the file's timestamp.
6. **Copying the `.gg` folder between machines.** That is your logins.

---

## 8. If automatic updates are set up later

Two things are needed, and both are missing now:

- **A signing key.** Tauri creates one. The public half goes in `pubkey`; the
  private half must be kept secret and never committed.
- **A place to host the files.** A URL that returns a small file describing the
  newest version. GitHub Releases can do this.

Once both exist, set `createUpdaterArtifacts` to `true`, fill in `pubkey` and
`endpoints`, and the app can check for updates by itself. Until then, section 5
is the only way an update reaches a machine.
