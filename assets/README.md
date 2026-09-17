# Animation suites

Each pet has its own folder containing `pet.json` and `spritesheet.webp`.
The Pets page discovers all suites at build time. After adding or changing a
suite, rebuild the app (`npm run make`); packaged apps do not scan external files.

`pet.json` contains a unique `id`, `displayName`, `description`, `schemaVersion: 1`,
`spritesheetPath: "spritesheet.webp"`, `frameWidth: 192`, `frameHeight: 208`, and
`animations`. Existing optional Codex metadata is preserved.

Each animation (`idle`, `working`, `tool`, `waiting`, `ended`, `interrupted`,
`failed`, `unknown`) specifies a **one-based** `row`, valid `frames`, and total
loop `durationMs`. Only valid cells are played; unused transparent cells are
excluded. Idle currently uses six frames over 4290 ms in every suite.

Selection is stored as `preferences.petId` in userData. Older settings or a
removed ID fall back to `deepseek`. Sprite playback restarts only when the
animation status or selected suite changes, not on activity text updates.

Run `npm run check` to validate metadata, visible cells, and saved selection.
