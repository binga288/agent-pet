# Architecture

## Maintenance boundaries

- `renderer/main.tsx` only mounts the selected view. `pet.tsx` owns pet interaction and `panel.tsx` owns the task center; `use-snapshot.ts` owns the IPC subscription lifecycle.
- `shared/animation.ts` contains pure frame timing, bounds validation and status/direction selection. Change `frameAt` for frame progression or `selectAnimation` for animation selection without touching React or Electron.
- `renderer/animation/playback.ts` owns the playback timeline and duplicate-frame suppression. Its clock/scheduler and draw callback are replaceable; the default retains the existing 40 ms interval. `sprite.tsx` only resolves assets, loads images and draws Canvas frames. Changing clip values restarts playback, while equivalent snapshot objects do not.
- `shared/pet-manifest.ts` normalizes and validates role metadata without Vite. `shared/pets.ts` discovers bundled assets. Per-role animation data stays in `assets/*/pet.json`; the standard v2 mapping is in the parser.
- `renderer/task-presentation.ts` owns display ranking and pet status selection. Notification scheduling remains in `core/notification-queue.ts`: its priority semantics differ from presentation ranking and are intentionally separate.
- `shared/geometry.ts` owns screen placement, independently of animation timing.
- `renderer/pet-actions.ts` routes configured clicks through the typed bridge. `main/focus-process.ts` provides the shared Windows focus implementation; IPC authorization remains in `main/main.ts`.

Run `npm run check` for TypeScript and the Node regression tests. Tests cover timing boundaries, walking fallbacks, task priority, scheduler cleanup, bundled manifests, placement and click routing. No new runtime dependencies are required.

## Data flow

```text
Codex or Claude lifecycle hook
  -> standalone desktop-pet-relay.exe (stdin JSON)
  -> authenticated POST 127.0.0.1:<ephemeral port>/events
  -> normalizeHook
  -> TaskStore + NotificationQueue
  -> constrained Electron IPC snapshot
  -> React pet and task-center windows
```

The main process owns lifecycle state, persistence, credentials, the tray, windows, display placement, and user-authorized hook changes. The renderer receives a presentation snapshot and exposes a small typed preload API. It has no Node integration; context isolation and sandboxing are enabled. Navigation, new windows, and renderer permission requests are denied. Main-process IPC checks the sender window and validates mutation arguments.

## Source responsibilities

| Path | Responsibility |
| --- | --- |
| `src/core/codex-adapter.ts` | Validate relay identity, map supported hooks, sanitize and bound strings. |
| `src/core/task-store.ts` | Session correlation, duplicate/stale event rejection, bounded history, unknown-on-restore behavior. |
| `src/core/notification-queue.ts` | Coalescing, priority, one active notification, dismissal and pause. |
| `src/integration/server.ts` | Loopback-only listener, authentication, request bounds and JSON delivery. |
| `src/integration/hooks.ts` | Explicit reversible configuration merge and owned-handler removal. |
| `scripts/relay.cjs` | Bounded stdin processing and one local delivery attempt. |
| `scripts/build-relay.mjs` | Node SEA blob creation and executable injection using postject. |
| `src/main/main.ts` | Electron windows/tray, connection setup, IPC, display placement and integration actions. |
| `src/main/storage.ts` | Preferences and short normalized history persistence. |
| `src/main/preload.ts` / `src/shared/api.ts` | Narrow renderer API and snapshot contract. |
| `src/shared/animation.ts` | Default manifest reference, elapsed-time frame selection and desktop placement calculations. |
| `src/renderer` | Task center, sprite canvas, bubbles, pointer hit testing and drag gestures. |
| `assets/<pet-id>/pet.json` and `spritesheet.webp` | Independent animation suites, metadata and per-status timing. |
| `src/shared/pets.ts` | Build-time discovery, metadata validation and selection fallback. |

## Transport contract

The relay stamps `receivedAt` at process launch and generates an event UUID. Its envelope contains `id`, `receivedAt`, optional bounded `origin`, and `hook`. The hook object permits only `hook_event_name`, `session_id`, `turn_id`, `tool_name`, `tool_use_id`, and `last_assistant_message`. Identifiers are bounded and the assistant excerpt is clipped to 180 characters. Prompt and tool-input fields are discarded before transmission.

Stdin is capped at 1 MiB. The relay reads the app's connection file containing an ephemeral port and 64-character hexadecimal token. It makes one HTTP request, uses a short request timeout, and exits through an 800 ms watchdog. Errors do not retry or block the agent indefinitely. It exits zero, writes no diagnostic output, and emits neutral `{}` JSON for a parsed Stop hook. It never supplies approval or continuation decisions.

The receiver binds only to `127.0.0.1`, accepts only `POST /events` with JSON content type, and caps payloads at 64 KiB. It rejects browser Origin/fetch-metadata requests and requires a Bearer token with constant-time comparison for equal-length values. Request timeouts and a connection limit bound exposure. JSON parsing or adapter validation errors return 400; successful processing returns 204.

The random token is recreated at app startup. `connection.json` resides in Electron's per-user data directory and is removed on clean exit. The relay authenticates possession of that local secret; it is not designed to resist another process already running with unrestricted access to the same user account.

## Hook configuration

Handlers use synchronous `timeout: 1` commands. Each owned command ends in the exact `--desktop-pet-hook-v1` namespace marker. The installer recognizes that marker, preserves foreign fields and handlers, and writes unique timestamp/UUID backups. It checks for changes before replacing the file. Unknown malformed structure is refused rather than repaired implicitly.

Development invokes the source relay through Node. Packaged hooks point to `resources/desktop-pet-relay.exe`, built as a standalone SEA binary, and use an absolute connection path. Packaged users need no separately installed Node runtime. The app does not mark hooks trusted: users review them through Codex `/hooks`.

The official [hooks reference](https://learn.chatgpt.com/docs/hooks), checked 2026-09-09, defines event contracts, timeouts in seconds, and Stop JSON output. Codex CLI 0.153.4 was discovered locally. This establishes the documented integration route and available CLI, not proof that every desktop lifecycle event has been received.

## State and persistence limits

The task store keeps at most 100 sessions, 100 recent events, and bounded duplicate/turn tracking. The notification queue is bounded at 100 entries including its active notification. History is restored as unknown task states. Active activity is not guessed from process names, stale logs, private databases, or elapsed silence.

Preferences and short normalized history are stored in `state.json` using a temporary-file replacement. The main process publishes snapshots every 250 ms, while sprite frames are calculated from elapsed time on an independent animation timeline. Summary changes do not restart the sprite timeline.

There are no outbound AI requests, model credentials, transcript readers, or adapters for other agent products. Source development can fetch dependencies and run a local Vite server; these are development activities, not the installed application's agent-data channel.

## Packaging and current limits

Electron Forge packages an ASAR application and copies the SEA relay as a resource. Makers target a Windows Squirrel installer and a Windows ZIP distribution. Login startup is opt-in. The SEA build's copied Node signature may produce a postject signature warning; the produced executable was smoke-tested, but release signing is not configured.

Transparent input behavior, screen scaling, packaged startup, and actual Codex desktop hook reception require live evidence. Consult the verification record before treating any of those as release-verified.

Packaged builds prefer the installed relay of the same app version when present. This prevents switching between portable and installed builds from changing the hook command and invalidating Codex trust. Different app versions can still require renewed hook review. Existing trust state is never written by Agent Pet.

## WSL integration

The WSL UI selects one local distribution and writes provider-specific shims under `~/.local/share/agent-pet/`. The shim runs a stable relay copied to `%LOCALAPPDATA%\\Agent Pet\\bin\\agent-pet-wsl-relay.exe` through `/mnt/c`. That Windows executable posts to the existing loopback receiver, so WSL NAT host address discovery and additional firewall exposure are unnecessary. WSL config merges preserve foreign entries and use the same provider markers as native Codex and Claude Code hooks. Event identity is `provider + origin + sessionId`, where the verified WSL origin is `wsl:<distro>`.
