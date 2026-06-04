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

## Track C — DONE

Recipe ergonomics cleanup. All actionable items completed:

1. **glibcLinker audit** — Evaluated: genuinely needed by virtually all recipes for intra-build dynamic linker. Not removable.
2. **`.foo-wrapped` renamed to `_hod_wrapped/`** — Wrapped ELFs now live in `bin/_hod_wrapped/<name>` instead of `bin/.<name>-wrapped`. Eliminates the POSIX glob footgun with `cp -a SRC/* DST/`.
3. **Strip standardization** — `spirv-tools` and `spirv-llvm-translator` now strip their outputs. `caCertEnv()` migration is 100% complete (6 stragglers migrated). `cxx: true` migration was already complete.
4. **hermeticPreamble simplification** — Not actionable; depends on item 1 which showed no simplification is possible.

Remaining low-purity work (migrate when touching):
- ~60 older recipes still using inline strip instead of `STRIP_ALL`
- 14 recipes with extra inline strip for directories not covered by helpers (`libexec`, `sbin`)
- 16 seed-path recipes using `/deps/seed/bin/strip` instead of the helper

---

## Track D — DONE

Closure distribution UX. `hod copy-closure --from` is now implemented (SSH and
local). `hod closure --list` is also available for machine-readable output.

`hod resolve` subcommand resolves a specifier to a recipe hash (useful
standalone and for remote resolution). `--remote-resolve` flag on
`copy-closure --from` falls back to resolving the specifier on the remote via
SSH when local resolution fails.

Remaining future items:
1. Pull-style flow with HTTP-fetchable cache layout (Narinfo-like protocol)
2. Name→hash registry for package-name-based resolution

---

## Track E — Trust-base reduction

Named as Phase 6 of `minimal-hod-vm-roadmap.md`. Long-running, low priority
until the desktop track is stable.

1. Audit what the base distro provides
2. Replace pieces one at a time (networking tools → shell → init)
3. Eventually: no package manager in the runtime image

**Rough size:** months.

---

## Track F — DONE

`file(1)` magic database resolution. Fixed in `src/wrap.rs`: when generating
wrappers, `share/misc/magic.mgc` is detected in the output itself (own prefix)
or in any runtime dep, and `MAGIC` is exported in the wrapper script. Works for
both `file` run directly and binaries that depend on `file` as a runtime_dep.
