# Hod

Hod is a deterministic, content-addressed build system written in Rust, with recipe authoring in Bun/TypeScript.

> **Latest milestone:** Hod can now build **Geany** from source, copy its runtime closure to another NixOS/KDE machine, and run it there successfully from the transferred store.

## What Hod does today

- builds content-addressed recipe DAGs
- stores recipes, blobs, and outputs in a local Hod store
- authors recipes in TypeScript via the SDK in `js/`
- relocates dynamic ELF binaries so they keep working after store transfer
- inspects and copies runtime closures with `hod closure` / `hod copy-closure`
- runs built packages with `hod run` / `hod shell`, and activates package sets with `hod profile`
- bootstraps its native toolchain from source, with round-trip validation

## Source of truth

- `recipes/**/*.ts` are the authoritative recipe definitions
- `.hod` files are import/export/debug artifacts, not the normal authoring workflow
- there is **no** top-level `PRD.md` in this checkout
- current docs live in `docs/`
- historical or in-progress design notes live in `plans/`

Start here:

- `docs/README.md` — current docs index
- `AGENTS.md` — agent/LLM quick-start
- `plans/README.md` — which plans are active vs historical

## Quick start

```bash
# enter the dev environment
nix develop --accept-flake-config

# evaluate a recipe file (imports recipes into the store)
bun run recipes/native/jq/jq.ts

# build by store hash
hod build --hash <recipe-hash>

# or run directly from a recipe .ts file
hod run recipes/native/jq/jq.ts -- --version

# inspect / transfer runtime closure
hod closure recipes/native/geany/geany.ts
hod copy-closure recipes/native/geany/geany.ts --to user@host

# activate a profile
hod profile activate profiles/default.ts
```

## Common validation

```bash
nix develop --accept-flake-config --command cargo test --no-run
nix develop --accept-flake-config --command cargo test -- --test-threads=1
```

Note: some heavyweight bootstrap / sandbox tests are `#[ignore]` and should only be run intentionally.

## Repository map

```text
src/               Rust core: store, build, sandbox, relocation, run/profile/closure CLI
js/                Bun/TypeScript SDK that shells out to `hod`
recipes/           TypeScript recipes and helper layers
profiles/          Example user profiles
examples/          Small examples
scripts/           Utility scripts
docs/              Current human/agent docs
plans/             Design history, active plans, handoff notes
tests/             Rust unit/integration tests
```

## Best places to go next

After the Nautilus + closure-transfer milestone, the strongest next front is:

1. **COSMIC desktop environment** — build the full COSMIC DE (compositor, panel, apps) from source, culminating in a bootable VM running COSMIC from the hod store. See `plans/cosmic-desktop-roadmap.md`.
2. **GUI runtime metadata/wrappers** — generalize the Nautilus work so more desktop apps run directly after transfer.
3. **Closure distribution UX** — `copy-closure --from`, cache workflows, and smoother multi-machine use.
4. **Bootstrap trust reduction** — seed minimization from the current bootstrap pipeline.

## For agents

If you are an automated coding agent or LLM, read `AGENTS.md` next.
