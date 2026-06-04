# Future Tracks

**Status:** Active — backlog of well-scoped tracks

Short writeups of tracks that aren't actively scheduled. Promote to its own
`plans/<name>.md` when ready to start.

---

## Track A — DONE

Niri desktop on the Arch VM. Now `niri-desktop-roadmap.md`.

---

## Track B — Hermetic bindgen infrastructure

Already a real plan: `bindgen-infrastructure.md`. Most useful before tackling
COSMIC components that need bindgen (`xdg-desktop-portal-cosmic`).

---

## Track C — Recipe ergonomics cleanup

Small audits and refactors:

1. **Audit `glibcLinker` usage.** With transitive closure working,
   many recipes that pass `glibcLinker: "glibc"` could plausibly drop
   it. Worth a careful pass to see how much simplification is available.

2. **Move `.foo-wrapped` out of dot-prefix.** A wrapping scheme that puts
   the real ELFs in a non-dotfile location (e.g., `_hod_wrapped/` or
   `foo.real`) would mean future bundling recipes don't have to remember
   the trailing-dot trick.

3. **`standardize-strip-in-profiles.md`** is already an active plan.

4. **`hermeticPreamble` simplification.** After item 1 is audited,
   the preamble's `glibcLinker` block could potentially be shrunk.

**Rough size:** 1–3 days each, mostly mechanical.

---

## Track D — Closure distribution UX

1. `hod copy-closure --from <remote>` (currently only `--to` works)
2. Pull-style flow: deploy machine fetches closure by recipe hash
3. Optional: HTTP-fetchable cache layout

**Rough size:** 2–4 days for `--from`. Cache layout is a larger effort.

---

## Track E — Trust-base reduction

Named as Phase 6 of `minimal-hod-vm-roadmap.md`. Long-running, low priority
until the desktop track is stable.

1. Audit what the base distro provides
2. Replace pieces one at a time (networking tools → shell → init)
3. Eventually: no package manager in the runtime image

**Rough size:** months.

---

## Track F — `file(1)` magic database resolution

`file <binary>` fails in deployed Hod environments because `MAGIC` isn't set
and default search paths don't reach the deployed `share/misc/magic.mgc`.

**Rough size:** small if option 2, medium if option 3.
