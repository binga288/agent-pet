# Functional specification

## Purpose and scope

Agent Pet is a Windows desktop companion for observed AI-agent activity. This version supports the local Codex hooks adapter only. The interface is Traditional Chinese. It uses the existing spritesheet and deterministic animation timing. Idle plays six frames over 4290 ms. The Pets page previews nine bundled animation suites and persists the selection. The former Python archive has been removed at the user's request.

The pet stays above ordinary windows, has a transparent background, does not appear on the taskbar, and does not take focus when shown. Empty pixels pass pointer input through to windows below. Opaque sprite pixels and notification controls remain interactive. A short click opens the task center; a drag moves the pet. Its position is stored and constrained to a display work area when displays change.

## User behavior

The task center has task, recent-activity, and settings views. A task represents **one Codex session** and displays its most recently accepted turn state. New turns update the same task. Session identifiers provide a stable fallback label; a hook does not reliably provide a human-readable task title.

Task cards expose copy-ID and copy-summary controls. The app does not open arbitrary links from incoming events, send replies, or approve tools. Users handle those actions in Codex.

The pet shows at most one notification bubble at a time. A bubble lasts eight seconds after becoming active and can be dismissed. Permission requests have highest priority, followed by failure, ended/interrupted turns, and routine activity. Routine updates for the same session coalesce. Pending notifications are bounded; full recent history remains available independently. Waiting tasks also appear in a persistent count badge until a later accepted event changes their state.

Pause affects notification presentation, while tasks and recent history continue updating. Hiding the pet leaves the tray and task center available. Login startup is opt-in and defaults to disabled. It is configured through Electron only in a packaged application.

## Observed state semantics

| Hook | Displayed state | Meaning |
| --- | --- | --- |
| `SessionStart` | Idle | A session-start event was observed. |
| `UserPromptSubmit` | Working | Codex accepted a user prompt event. |
| `PreToolUse` | Tool | A tool invocation is starting. |
| `PermissionRequest` | Waiting | A permission request was observed; approve it in Codex. |
| `PostToolUse` | Working | Tool execution returned; work may continue. |
| `Stop` | Turn ended | Codex ended a turn; this does not certify success. |
| `Interrupt` | Interrupted | An active main-thread turn was interrupted. |
| `SessionEnd` | Unknown | The session ended; no active state is asserted. |
| `PreCompact` / `PostCompact` | Working | Context compaction is occurring or has returned. |

`failed` exists in the normalized state vocabulary and presentation, but this Codex hook mapping does not synthesize failure from ordinary tool results or text. No timeout infers success, failure, waiting, or completion. After restarting Agent Pet, restored tasks become unknown until fresh events arrive. During a run, the last observed state remains labeled with its timestamp; event receipt is not a continuously polled health signal.

Older timestamps, duplicate IDs, events for previously superseded turns, and late activity after a terminal state are rejected according to the task store's correlation rules. An uncorrelated completion cannot terminate an explicitly identified active turn.

## Capability boundary

| Capability | Current implementation | Evidence boundary |
| --- | --- | --- |
| Transparent pet, tray, task center | Implemented in Electron and React | Live desktop and packaged checks are required. |
| Deterministic spritesheet playback | Manifest validation and elapsed-time frames | Live desktop and packaged checks. |
| Concurrent Codex sessions | One bounded task state per session | Live observation required. |
| Hook installation/removal | Explicit UI action; backup and merge | Live install/uninstall check; no silent global installation. |
| Authenticated local relay | Loopback HTTP and standalone SEA executable | Packaged smoke test; standalone relay verified manually. |
| Codex desktop event coverage | Adapter supports the hooks above | Actual desktop event observation is pending, not inferred from installation. |
| Other agent products | Unsupported | Future adapters require documented sources; tests only if invariants are non-obvious. |
| Assistant interaction or approvals | Unsupported | User returns to Codex. |
| Automatic AI summarization | Unsupported | No model requests or API key configuration. |

## Installation and persistence

The user explicitly connects from settings. Installation merges handlers into the user's active Codex hooks file, preserving foreign entries and top-level metadata. Each mutation backs up the prior content under a unique name. Malformed or concurrently changed files cause an error rather than an overwrite. `/hooks` trust review remains a Codex user action.

The app persists preferences, position, and the last 100 normalized history events in its Electron user-data directory. Transport credentials are generated at launch and are not passed to the renderer. A Stop summary can retain a sanitized 180-character assistant excerpt. Raw prompt bodies, tool input, and transcript data are not retained.

Remove the integration through settings before uninstalling the app. Other hooks and recovery backups are preserved. App installation, startup, and packaging do not silently modify Codex configuration.
