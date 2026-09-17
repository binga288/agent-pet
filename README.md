# Agent Pet

A Windows desktop companion that shows observed Codex activity through a transparent animated pet and a task center. Notifications are silent and do not take focus. A finished turn is labeled **Turn ended**, not task success.

## Run from source

Use a supported Node.js installation with npm; this workspace was built using Node 24.16.0. In PowerShell, from the project directory:

```powershell
npm ci
npm start
```

Click the pet or double-click its tray icon to open the task center. Drag the pet to move it. The tray also supports hiding the pet, pausing reminders, and quitting. Windows login startup is **off by default**.

## Connect Codex

1. Open **偏好與連線** in the task center and select **連接 Codex**.
2. Agent Pet backs up and merges its handlers into `hooks.json` under `CODEX_HOME`, or `%USERPROFILE%\.codex` when that variable is unset. It preserves other handlers. Starting or installing the app alone does not install hooks.
3. In Codex, use `/hooks` to review and trust the added handlers. If the desktop app does not expose that entry point, use Codex CLI and reopen the Codex session afterward.
4. Start a new Codex turn and inspect **最近事件** and **已觀察事件**. Written configuration alone does not prove that desktop events are arriving.

Codex CLI 0.153.4 was found in the development environment. The official [Codex hooks documentation](https://learn.chatgpt.com/docs/hooks) was checked on 2026-09-09. Actual Codex desktop lifecycle reception remains a separate live verification step; fixture tests do not establish it.

Reply to requests and approve tools in Codex. Agent Pet only reports activity and provides copy actions for session IDs and summaries. It does not send prompts or approvals.

## Build and check

```powershell
npm run check
npm run package
npm run make
```

`check` runs TypeScript and the automated tests. `package` produces the application directory under `out`; `make` also creates Windows installer and ZIP artifacts under `out/make`. Both build a standalone Node SEA relay first. Packaged applications include Electron and the relay, so recipients do **not** need Node.js installed. Source development does require Node on PATH.

Before sharing a release, verify the packaged executable, tray behavior, transparent hit testing, display scaling, and actual Codex hooks. See [the verification loop](docs/agent-loop.md) for evidence requirements and remaining live checks.

Quit Agent Pet from its tray before reinstalling/upgrading. A silent reinstall while the previous version was running stalled on this host; closing it and rerunning the installer restored version 0.1.1 successfully. The ZIP build can also be used directly.

## Privacy and removal

The app receives authenticated events only on `127.0.0.1`. It makes no outbound AI calls and reads no private Codex databases or transcript logs. Local history is limited to 100 short normalized events. A Stop event can include the first 180 characters of the assistant's final message; that excerpt is stored in local history. Raw prompts and tool arguments are discarded by the relay.

Before uninstalling or deleting the app, select **解除整合** in its connection settings. This removes only Agent Pet handlers and preserves other hooks. Then quit and uninstall the installed application, or remove the portable directory. Hook backups remain alongside `hooks.json` for recovery. Preferences and short history remain in Electron's per-user `Agent Pet`/`agent-pet` data directory; the exact location is determined by Electron's `userData` path. The temporary `connection.json` is removed on clean exit.

The prior Python archive was removed at the user's request. The Electron application uses its own assets. The workspace currently has no Git repository, so no commits were created.

## Engineering documents

- [Functional specification](docs/functional-spec.md)
- [Architecture and integration boundaries](docs/architecture.md)
- [Implementation and verification loop](docs/agent-loop.md)
- [Verification results and remaining checks](docs/verification.md)

## Pets

Open **Pets · 桌寵** in the sidebar to preview and select one of nine bundled suites. Selection is saved across restarts. Each suite lives in `assets/<pet-id>/` with `pet.json` and `spritesheet.webp`; see [asset format](assets/README.md). Adding a suite requires rebuilding the app.

## Claude Code hooks

The **Claude Code 連線** card adds user-global hooks to `~/.claude/settings.json` while preserving existing handlers. They forward only lifecycle metadata for SessionStart, UserPromptSubmit, tool activity, permission requests, Stop, StopFailure, and SessionEnd. Restart Claude Code after connecting. Agent Pet does not read prompts, tool input, or transcripts.

## WSL Codex and Claude Code

The **WSL 連線** card lists local WSL distributions. Select one, then install Codex or Claude Code hooks independently. Agent Pet writes a small shell shim inside that distribution and invokes a stable Windows relay through WSL interop; the relay delivers only to the Windows loopback receiver. No WSL host-IP discovery, port exposure, or firewall rule is required.

The app stores the relay at `%LOCALAPPDATA%\\Agent Pet\\bin\\agent-pet-wsl-relay.exe`, outside versioned Electron resources and Codex cache paths. WSL hook configuration is backed up and merged in `~/.codex/hooks.json` or `~/.claude/settings.json`; removal deletes only Agent Pet entries. Codex hooks must be trusted from Codex running inside that WSL distribution. Each task records its source as `wsl:<distro>`, preventing WSL and Windows session IDs from colliding.
