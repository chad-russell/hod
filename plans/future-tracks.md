# Future Tracks

**Status:** Active — backlog of well-scoped tracks that can be promoted to full plans when ready
**Owner:** core

## Purpose

Holds short writeups of tracks that have been thought through but
aren't actively scheduled. Each entry is enough to remember the shape
of the work and the reasoning behind it. When a track is ready to
start, promote it to its own `plans/<name>.md` file.

## Track A — Minimal graphical session in QEMU

**One-liner:** stand up a Wayland session in the desktop VM running a
Hod-built compositor and one terminal app.

**Prerequisites:** `service-boundary.md` decisions made and PoC
service working.

**Sketch:**

1. Pick a compositor for the first iteration. Two options:
   - `cosmic-comp` — already built, full COSMIC integration eventually.
     Heavier; needs more session plumbing.
   - A tiny Wayland compositor (e.g., `cage`, `sway`, `niri`) — simpler
     bring-up, tests the graphics stack without committing to COSMIC's
     session architecture.
2. Pick a launch mode:
   - From a TTY login: source the Hod profile env, then `cosmic-session`
     or equivalent.
   - Via a login manager (greetd is the simplest).
3. Confirm software rendering works first (llvmpipe via Mesa). Don't
   block on virtio-gpu hardware acceleration.
4. Smoke test: a Hod-built terminal opens (`alacritty` or
   `cosmic-term`), text input/output works, can launch another Hod
   binary from inside it.
5. Wayland clipboard, screenshot (`grim`/`slurp`), and an
   approximation of "I can use this for actual work" come next.

**What makes this hard:** session integration. Wayland compositors
expect specific environment variables (`WAYLAND_DISPLAY`,
`XDG_RUNTIME_DIR`, `XDG_SESSION_TYPE`), specific socket directories,
specific portals running. Hod recipes generally don't manage runtime
env beyond what each binary's wrapper script sets up. The session
launcher has to bridge between "Hod profile activated, env.sh
sourced" and "compositor running with all of this set."

**When to promote to a real plan:** once `service-boundary.md` is
implemented and we have at least one Hod-managed service running
under systemd.

**Rough size:** 2–4 weeks of focused work. Bulk is debugging session
plumbing, not building new packages — most of the components already
exist.

**Reuses:** `cosmic-desktop-roadmap.md` for the COSMIC-specific
component build plan, once the session-launch path is solid.

---

## Track B — Hermetic bindgen infrastructure

**One-liner:** make `bindgen` work cleanly inside the Hod sandbox so
recipes that generate FFI bindings don't need vendored output or
patched `build.rs` files.

**Status:** already documented as `plans/bindgen-infrastructure.md`.
Listed here because it's an active track that can be picked up
independently of the VM/desktop work.

**When to promote:** it's already a real plan; just start working it.
Most useful right before tackling COSMIC components that need bindgen
(notably `xdg-desktop-portal-cosmic`).

---

## Track C — Recipe ergonomics cleanup

**One-liner:** small audits and refactors that became reasonable to do
once `transitive-runtime-closure.md` landed.

**Items:**

1. **Audit `glibcLinker` usage.** With transitive closure working,
   many recipes that pass `glibcLinker: "glibc"` could plausibly drop
   it and rely on `dep("toolchain")` plus the toolchain's
   `runtime_deps: ["glibc"]` to bring glibc into the sandbox
   transitively. The preamble would only need to set up FHS symlinks
   pointing at the toolchain's bundled glibc rather than a separate
   one. Worth a careful pass to see how much simplification is
   actually available.

2. **Move `.foo-wrapped` out of dot-prefix.** The `cp -a SRC/.` fix in
   `native-toolchain.ts` is symptomatic. A wrapping scheme that puts
   the real ELFs in a non-dotfile location (e.g., a sibling
   `_hod_wrapped/` dir, or just renaming to `foo.real`) would mean
   future bundling recipes don't have to remember the trailing-dot
   trick. Also slightly more discoverable when `ls`-ing a bin dir.

3. **`standardize-strip-in-profiles.md`** is already an active plan
   for tightening up strip behavior across profiles. Compatible with
   item 2 above; do them together if convenient.

4. **`hermeticPreamble` simplification.** Once item 1 above is
   audited, the preamble's `glibcLinker` block could potentially be
   shrunk or made automatic (driven by a flag on the toolchain dep
   rather than a separate option). Don't do this until item 1 says
   it's safe.

**When to promote:** anytime a "cleanup day" is on the schedule. None
of these block other work. Item 2 in particular is a small,
self-contained refactor that would pay off forever.

**Rough size:** 1–3 days each, mostly mechanical.

---

## Track D — Closure distribution UX

**One-liner:** make the `hod copy-closure` story symmetric and add
binary-cache patterns.

**Items:**

1. `hod copy-closure --from <remote>` (currently only `--to` works).
2. A pull-style flow: deploy machine wants the same closure as a
   build host, fetches by recipe hash without rebuilding.
3. Optional: an HTTP-fetchable cache layout (Nix has `binary-cache`
   here; we'd want something simpler).

**When to promote:** when you have two machines that both want the
same Hod closures and the manual `--to` from build-host is becoming
annoying. Today the ThinkPad migration was the canonical use case;
once the VM workflow is the main path, `--from` becomes useful for
"laptop wants what the VM built" or vice versa.

**Rough size:** 2–4 days for the basic `--from`. The cache-layout
work is a separate, larger effort.

---

## Track E — Trust-base reduction

**One-liner:** shrink the non-Hod base in the VM toward an LFS-like
seed.

**Status:** named as Phase 6 of `minimal-hod-vm-roadmap.md`. Long
running, low priority until the desktop track is up.

**Sketch:**

1. Audit what the base distro provides today (kernel, init, package
   manager, busybox/coreutils, networking tools, etc.).
2. Identify which of those Hod could replace cleanly.
3. Replace one piece at a time, starting with the parts that don't
   touch boot or recovery (probably user-side networking tools first,
   shell second, init last).
4. Eventually: no package manager in the runtime image; everything
   above the kernel and init is from the Hod store.

**When to promote:** after the desktop track is stable. Doing this
before would slow down higher-value work.

**Rough size:** months. Not a single plan, more like a long sequence
of small ones.

---

## Track F — `file(1)` magic database resolution

**One-liner:** make `file <binary>` work in deployed Hod environments
by ensuring the magic database is reachable by default.

**Discovered:** Alpine VM validation pass, 2026-05-27.

**Symptom:**

```
$ source ~/.hod/profiles/minimal-vm/env.sh
$ file /bin/busybox
file: could not find any valid magic files! (No such file or directory)
```

`file --version` works (the binary loads), so it's not a
closure-transfer issue. The package contains `share/misc/magic.mgc` but
`file` can't find it because `MAGIC` isn't set and the default search
paths point at `/usr/share/file/...` rather than the deployed path.

**Possible fixes:**

1. Patch the recipe to bake a relocatable default path into `file` at
   build time.
2. Generate a wrapper that sets
   `MAGIC=$bin_dir/../share/misc/magic.mgc` alongside the existing
   wrapper-managed env vars.
3. Add `share/misc` to a generic search-path mechanism the wrapper
   already handles, so future tools with bundled data files get the
   same treatment.

(2) is probably the cleanest: it follows the same pattern as the
existing `XDG_DATA_DIRS` / `GIO_LAUNCH_DESKTOP` wrapper hooks. (3) is
more invasive but pays off for any future package that wants to bundle
auxiliary data files.

**Test coverage exists:** `tests/vm/cases/minimal-vm.ts` already has a
"file recognizes a known binary" case that fails with this issue and
will pass once it's fixed.

**Rough size:** small if (2), medium if (3).

---

## How this file gets used

When a track is ready to be worked, promote it:

1. Copy the section above into a new `plans/<name>.md`.
2. Expand to a full plan (status, deps, phases, acceptance criteria).
3. Update `plans/README.md` to add the new plan and remove the entry
   from this file.

This file is meant to stay short. If a track has more design weight
than fits in a few paragraphs, it should already be its own plan.
