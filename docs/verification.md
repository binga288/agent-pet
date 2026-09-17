# Verification record — 2026-09-09

## Evidence obtained

- Follow-up: removed `old_animation` at the user's request (confirmed absent). Idle now loops over six frames in 3300 ms instead of 2200 ms; typecheck and all 48 tests passed. Rebuilt the application and replaced the installed 0.1.1 ASAR, verified matching SHA-256, and restarted Agent Pet. Archive checks below describe the original migration, before removal.
- Archived 17 original files with SHA-256 equality; new assets are independent of `old_animation`.
- `uv sync --project old_animation` rebuilt the archived environment. An offscreen `DesktopPet` startup loaded its real asset and confirmed idle uses six frames.
- `npm run check`: TypeScript and 48 tests passed on the final source. Tests cover asset alpha pixels, loop bounds, placement, state/notification regressions, restart storage, transport and hook preservation.
- Source production-bundle and packaged-executable fixture E2E both passed via `tests/electron-smoke.mjs`: two windows, priority bubbles, 8-second expiry, ongoing animation after another task ends, context isolation, temporary hook install/removal.
- `npm start` launched the Vite development server, and the same fixture E2E passed against `http://localhost:5173` with no renderer exceptions.
- `npm run make` and `npm run test:electron` passed for final 0.1.1. The ASAR contains only 12 entries, including preload and renderer bundles; no archived Python or virtual environment. Final artifact hashes are in `release-sha256.json`.
- Installed-version test: the 0.1.1 bootstrapper stalled during a second silent install on this host and was terminated. A direct bundled `Squirrel.com --install=C:/desktop_pet/out/make/squirrel.windows/x64 --silent` run succeeded (exit 0), but installed into a tool-relative staging directory; it is not evidence of a repaired per-user installation. The bootstrapper's upgrade path is not certified; the portable build passed its full E2E check.
- Recovery: after closing all old Agent Pet processes, rerunning `AgentPetSetup.exe --silent` finished and restored the expected per-user `agent_pet` directory with `app-0.1.1`, the stable launcher, Update.exe, and regenerated shortcuts. Quit Agent Pet before reinstalling/upgrading. Unattended in-place upgrades with a running app are not certified.
- The final installed 0.1.1 executable was launched. Agent Pet's ten hook handlers were merged into the real user `~/.codex/hooks.json` through the tested installer function, with a backup and existing handlers preserved. Hook trust was not modified. The app was restarted to refresh integration status.
- A structural comparison against the hook backup confirmed all original hooks and metadata were preserved exactly. The extra tool-relative install staging directory was removed after the per-user install was recovered.
- Screenshots: `test-results/panel-empty.png`, `panel-active.png`, `panel-settings.png`, `pet-waiting.png`. Native Windows capture also showed the rendered pet.
- `npm run make` produced a Squirrel installer and portable ZIP. The 0.1.0 installer returned exit 0, created desktop/Start-menu shortcuts, and the installed executable opened its pet and task-center windows. The final 0.1.1 build includes later command-quoting and storage hardening.
- Standalone relay executed without separately invoking Node. Actual Windows `cmd /C` invocation tests covered spaced Unicode/ampersand paths with both source and SEA relay.
- Scoped independent review found two core ordering/notification defects and one ongoing-animation priority defect; all were fixed with regression checks. Final scoped review reported no remaining important findings.

## Limits and next validation

- WSL Codex and Claude Code integration has fixture coverage for shim generation, configuration merge/removal, origin isolation, and relay payload bounds. On 2026-09-09, the packaged app installed hooks in Ubuntu and synthetic UTF-8 `UserPromptSubmit` events passed through both provider shims to the Windows loopback receiver with `origin: wsl:Ubuntu`. A normal interactive task in each WSL provider remains the final provider-hook coverage check.

- **Actual Codex desktop events are not yet verified.** Codex CLI 0.153.4 and official hook docs establish a route, not a live result. No tests trust hooks automatically. Connect through settings, review/trust in Codex `/hooks`, then run a real task and record each observed event name.
- Hook capability coverage remains pending for SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, Stop and Interrupt. Unsupported failure evidence is not guessed.
- Native input automation refused to start a drag because the pet's click-through window was not the hit-test target while the cursor was outside its sprite. Native dragging/pixel click-through therefore remain manual acceptance items; geometry and UI event plumbing tests are not substitutes.
- One 2560-wide Windows desktop was observed. Mixed-monitor DPI, display removal, login startup, and installed-version update behavior still require manual acceptance.
- Current runtime dependency audit (`npm audit --omit=dev`) reports 0 vulnerabilities. Full development-tool audit reports 24 transitive advisories (including legacy Forge tar tooling); see `test-results/npm-audit.json`. No unreviewed force upgrades were applied. Distribution binaries are unsigned.

## Reproduction commands

```powershell
npm ci
npm run check
npm run make
```

As of the 2026-09-17 maintenance refactor, `npm run check` runs TypeScript and Node regression tests in `tests/*.test.mjs`. These cover animation and presentation invariants; native interaction and packaged application behavior still require separate live verification. Older test counts above describe historical verification, not the current suite.

## Build correction

Forge's legacy `extract-zip` extraction exited early with Node 24 on this machine. A package override uses Electron's official drop-in `@electron-internal/extract-zip@1.0.5` for Packager. The subsequent package/make completed. Other dependency behavior was left unchanged.

- Theme follow-up: neutral black/gray surfaces and white text; bubble border orbits over 4 seconds and breathes over 3 seconds. Reduced motion disables it. All 48 tests and packaged fixture E2E passed, including changing border angle/opacity and reduced-motion checks. Reviewed panel and bubble screenshots. Rebuilt installer/ZIP, refreshed release hashes, and updated/restarted installed ASAR with hash equality. Preserved the externally adjusted 4290 ms idle timing; loop test follows the manifest.

- Pets gallery: reorganized nine suites into named asset folders with per-status JSON manifests. Removed only the root spritesheet duplicate after SHA-256 equality with deepseek. All 49 tests passed, validating every configured cell across all suites and persisted selection restoration. Packaged fixture E2E passed: nine cards, selection sync to pet, image change, persisted petId, rejection of unknown ID, and existing border animation checks. Reviewed test-results/pets-gallery.png. Installer/ZIP rebuilt, hashes refreshed, installed ASAR hash verified and application restarted. New suites are discovered at build time.

- Connection diagnosis: official app-server hooks/list reported all ten Agent Pet hooks enabled but modified, because portable out/ relay path replaced the installed app path. Restoring the existing installed command through installHooks returned all ten to trusted without editing trust state. Authenticated invalid payload returned 400 without adding an event. Added matching-version installed-relay preference for portable builds; 50 tests and packaged fixture E2E passed. Applied installed ASAR with hash equality and rechecked all ten trusted. Live Codex event receipt still requires a new real work turn; not claimed from fixture tests.
