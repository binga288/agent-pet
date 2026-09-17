# Implementation and verification loop

## Working agreement

Make changes within the accepted desktop-pet scope, preserve the archived Python project, and keep event claims tied to observable evidence. This workspace is not a Git repository, so this work does not have commits or a PR. Do not describe a local file edit as committed.

Use this loop for each meaningful behavior change:

1. **Read and reproduce.** Read the functional spec, architecture and latest handoff. Select one bounded task. Use deterministic fixtures to establish the current failure and expected observable behavior before implementation.
2. **Implement a bounded change.** Identify the responsible layer, implement the smallest correction, and keep unrelated files unchanged.
3. **Typecheck.** Run `npm run check` for TypeScript. Re-run after later relevant changes; an earlier pass does not validate new edits.
4. **Review.** Inspect the implementation against the requirement, including state truthfulness, namespace ownership, privacy filtering, renderer isolation, and bounded waits. Fix actionable findings and repeat the relevant reproduction.
5. **Capture evidence.** Record the command, result, artifact path, and whether it was a fixture, source app, packaged app, or real Codex event. Keep pending checks explicit.

## Automated verification

```powershell
npm ci
npm run check
npm run build:relay
```

`npm run check` runs TypeScript only — there are no automated tests. Tests are only written when genuinely needed for long-term maintenance of non-obvious invariants. Live and manual checks are the primary verification path.

The standalone SEA relay was smoke-tested with a Stop fixture and unavailable connection. It returned `{}` and exit code zero. A synthetic `Stop` is not evidence that the real Codex desktop app emitted Stop.

## Archive evidence

The original migration verified all **17 files** before archiving. The Python archive was subsequently removed at the user's request; the Electron runtime retains its own independent assets.

## Live acceptance checklist

Record results only after actually performing these checks. See [verification.md](verification.md) for the current evidence and remaining manual checks; screenshots and packaged E2E checks are complete, while actual Codex desktop lifecycle reception remains unverified.

- Start the source app and confirm the pet and task center render correctly.
- Confirm transparent pixels pass input through, opaque sprite pixels drag, and a click opens the task center.
- Verify the tray, pause/resume, hide/show, quit, position persistence, and display-edge placement.
- Check mixed display scaling or clearly state which display configuration was tested.
- Build with `npm run make`; launch the packaged executable and confirm its relay resource is present and runs without Node on PATH.
- Verify the installer and portable ZIP separately before claiming both ready for distribution.
- Only after explicit user action, merge real Codex hooks, review/trust them in `/hooks`, and reopen a session as needed.
- Observe actual working, tool, waiting, ended, and interrupted events where the host supports them. Record each hook name and source separately; do not claim full coverage from a single event.
- Verify that Stop displays **Turn ended**, never success inferred from text or timing.
- Restart Agent Pet and confirm prior tasks return as unknown until fresh events arrive.
- Remove Agent Pet hooks through settings and verify foreign handlers remain before uninstalling the app.

## Evidence terminology

**Implemented** means the code path exists. **Fixture verified** means controlled synthetic data exercised a path (e.g. a scripted Playwright run). **Live observed** means the actual application or Codex source emitted the observed behavior. **Packaged verified** means the built executable was launched and checked, not merely that the maker completed.

Codex CLI 0.153.4 was discovered and the [official hook documentation](https://learn.chatgpt.com/docs/hooks) was checked on 2026-09-09. Neither fact certifies desktop hook reception. Keep capability and limitation wording aligned with the strongest evidence actually available.

Pets handoff: edit assets/<id>/pet.json for per-suite timing; add a folder with pet.json and spritesheet.webp, then run npm run check and npm run make. Pets gallery and storage fallback are implemented. Selection E2E evidence is in test-results/pets-gallery.png. Runtime import of external folders is outside this change.
