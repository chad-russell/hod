**ARCHIVED:** This plan is superseded by `plans/bootstrap-roadmap.md` (the single source of truth). This file is kept for historical reference only.

# Plan: Build Musl From Source → Full Bootstrap Self-Hosting

**Status:** Phases 1–4 complete. Phase 5 resolved via two-tier seed architecture (see `docs/bootstrap-pipeline.md`). Phase 6+ deferred. Follow-up plan: `plans/migrate-to-hod-seed-root.md`.
**Goal:** Replace the two opaque seed artifacts (musl.cc download, unknown-origin busybox) with Hod-built equivalents, making the entire bootstrap pipeline auditable from source code.

**Current state:**
1. ✅ `recipes/bootstrap/musl-build.ts` — musl 1.2.5 built from source, validated
2. ✅ `recipes/bootstrap/binutils-musl.ts` — binutils 2.37 built from source, validated
3. ✅ `recipes/bootstrap/gcc-musl.ts` — gcc 11.2.0 built from source (C + C++), validated
4. ✅ `recipes/bootstrap/hod-musl-toolchain.ts` — assembled into `x86_64-linux-musl-native/` layout
5. ✅ `recipes/bootstrap/hod-seed-root.ts` — busybox + Hod-built toolchain, fully validated
6. 🔲 `recipes/bootstrap/busybox.ts` — still `fileFromHash` (opaque)

**Architecture decision:** The pre-built musl.cc download is *not* removed. It is contained as the
irreducible bootstrap seed, used only by the bootstrap ladder (shims, gmp/mpfr/mpc, gcc-musl
itself). All downstream recipes should use `hod-seed-root` instead. See `docs/bootstrap-pipeline.md`
for the two-tier seed architecture and `plans/migrate-to-hod-seed-root.md` for the migration plan.

## Phases

### Phase 1: Build musl libc from source

This is the smallest, most self-contained step. Musl is a small C library
(~500KB source) that compiles cleanly with any gcc.

- [x] Create `recipes/bootstrap/musl-source.ts`
  - Download musl source tarball (musl 1.2.5 from https://musl.libc.org/)
  - Record the BLAKE3 hash after first download

- [x] Create `recipes/bootstrap/musl-build.ts`
  - Build musl from source using seed's gcc
  - `./configure --prefix=/ && make -j$(nproc) && make install DESTDIR=$OUT`
  - CC=/deps/seed/bin/gcc
  - This produces: `lib/libc.so`, `lib/ld-musl-x86_64.so.1`, `include/`, `crt/*.o`
  - Verify the output structure matches what the musl.cc tarball provides

- [x] Create `recipes/bootstrap/validate-musl-build.ts`
  - Smoke test: compile a trivial C program using the Hod-built musl
  - Verify it links against the built libc.so
  - Verify the binary runs inside a sandbox

### Phase 2: Build musl-targeting binutils from source

Binutils provides `as`, `ld`, `ar`, `ranlib`, `strip`, `objcopy`, etc.
We need a musl-targeting build to replace the ones from the musl.cc tarball.

- [x] Create `recipes/bootstrap/binutils-source.ts`
  - Download GNU binutils source (binutils 2.37)
  - Record hash

- [x] Create `recipes/bootstrap/binutils-musl.ts`
  - Build binutils targeting x86_64-linux-musl
  - `../configure --target=x86_64-linux-musl --prefix=/ --disable-werror`
  - CC=/deps/seed/bin/gcc
  - Produces: `bin/x86_64-linux-musl-as`, `bin/x86_64-linux-musl-ld`, `ar`, `ranlib`, etc.
  - Verify output structure matches musl.cc's binutils

### Phase 3: Build musl-targeting gcc from source

This is the most involved step. We're building a gcc that targets musl,
using the seed's existing musl gcc as the bootstrap compiler. This replaces
the gcc from the musl.cc tarball.

- [x] Create `recipes/bootstrap/gcc-source.ts`
  - Download GCC source (gcc 11.2.0 — same major version as seed's 11.2.1)
  - Record hash

- [x] Create `recipes/bootstrap/gcc-musl.ts`
  - Build GCC targeting x86_64-linux-musl (C + C++)
  - Native build (build=host=target=x86_64-linux-musl)
  - Uses:
    - Hod-built musl from Phase 1 (target C library)
    - Hod-built binutils from Phase 2 (target assembler/linker)
    - Seed's gcc as the bootstrap compiler
  - `../configure --target=x86_64-linux-musl --prefix=/ --enable-languages=c,c++ --disable-multilib`
  - Produces: `bin/x86_64-linux-musl-gcc`, `cc1`, `cc1plus`, `libgcc`, `libstdc++`, etc.
  - Self-contained: musl headers and runtime merged into output
  - Verify structure matches musl.cc's gcc

- [x] Create `recipes/bootstrap/validate-gcc-musl.ts`
  - Compile and run C and C++ programs (dynamic and static)
  - Verify the binaries are musl-linked
  - Verify no glibc references

### Phase 4: Assemble Hod-built musl toolchain

Replace the musl.cc download with a recipe that assembles the components
we built in Phases 1–3.

- [x] Create `recipes/bootstrap/hod-musl-toolchain.ts`
  - Assemble into one output directory:
    - gcc-musl → `bin/`, `lib/`, `libexec/`, `lib/gcc/`, `include/`
    - binutils-musl → `bin/`
    - musl-build → already merged into gcc-musl output
  - Output structure matches `musl-toolchain.ts` output (`x86_64-linux-musl-native/`)
  - seed-root.ts depends on specific paths like `x86_64-linux-musl-native/bin/` — all matched

- [x] Create `recipes/bootstrap/validate-hod-seed-root.ts`
  - Full validation using assembled toolchain as seed-root
  - C programs: dynamic, static, multi-file, optimized
  - C++ programs: dynamic, static (with std::string, std::vector)
  - All 10 tests pass

### Phase 5: Wire hod-musl-toolchain into seed-root

**RESOLVED via two-tier seed architecture.**

Direct wiring of `hod-musl-toolchain` into `seed-root.ts` creates a circular dependency:
`seed-root → hod-musl-toolchain → gcc-musl → shims/make → seed-root`.

Instead, a separate `hod-seed-root.ts` uses the Hod-built toolchain. The original
`seed-root.ts` is kept for the bootstrap ladder only. All downstream recipes
should migrate to `hod-seed-root.ts`.

See `docs/bootstrap-pipeline.md` (Two-Tier Seed Architecture) and
`plans/migrate-to-hod-seed-root.md` (migration plan).

- [x] Create `recipes/bootstrap/hod-seed-root.ts`
- [x] Validate with `validate-hod-seed-root.ts` (10 tests pass)
- [x] Document the architecture in `docs/bootstrap-pipeline.md`
- [ ] Migrate downstream recipes (see `plans/migrate-to-hod-seed-root.md`)

### Phase 6: Build seed busybox from source

Replace the opaque `fileFromHash` busybox with one built from source.

- [ ] Create `recipes/bootstrap/busybox-source.ts` (if not already existing)
  - Note: `recipes/toolchain/busybox-source.ts` already downloads busybox 1.37.0 source
  - Either reuse that or create a separate bootstrap variant
  - Consider: the seed busybox may be a different version than 1.37.0

- [ ] Create `recipes/bootstrap/busybox-from-source.ts`
  - Build busybox static using the Hod-built musl toolchain from Phase 4
  - Same approach as `busybox-native.ts` but using `hod-musl-toolchain` instead of seed
  - `make defconfig` + `CONFIG_STATIC=y`
  - Verify: `readelf -l busybox | grep INTERP` returns nothing (static)

- [ ] Update `recipes/bootstrap/busybox.ts`
  - Replace `fileFromHash("41eee14f...")` with a reference to `busybox-from-source`
  - OR: update `seed-root.ts` to import from `busybox-from-source` directly

- [ ] Validate full pipeline
  - Build `seed-root` → verify identical applet set
  - Build `cross/gcc-stage1` → must succeed
  - Build `native-toolchain` → must succeed
  - Build `ncurses` → must succeed

### Phase 7: Round-trip reproducibility check

The gold standard: prove the Hod-built toolchain can rebuild itself.

- [ ] Create `recipes/bootstrap/validate-round-trip.ts`
  - Use the current pipeline (seed → hod-musl-toolchain → gcc-stage2) to
    rebuild `hod-musl-toolchain` itself
  - Compare the output hash of the rebuilt toolchain with the original
  - If hashes match: fully self-hosting and reproducible
  - If hashes differ: investigate (expected if timestamps, build IDs, or
    nondeterministic ordering leaks in)

- [ ] Document any reproducibility gaps found
  - Common culprits: `__DATE__` macros, build timestamps, file ordering in `ar` archives
  - Fix what's fixable; document what isn't

## Validation Checklist

After all phases:

- [ ] Zero pre-built binary downloads remain in `recipes/bootstrap/`
      (except potentially a minimal seed bootstrap, if we decide to keep one)
- [ ] Every artifact in the pipeline can be traced back to source code
- [ ] `seed-root` builds successfully with Hod-built components
- [ ] The full pipeline from seed-root through native-toolchain completes
- [ ] Downstream packages (ncurses, cbonsai) build identically
- [ ] `sources/` directory can be emptied and all sources re-downloaded by recipes

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| musl.cc tarball has a specific internal layout that's hard to replicate | Phase 4 validates output structure before wiring in. Can adjust either side. |
| Building gcc is slow (30+ min) | Expected. Only needs to happen once per toolchain version bump. |
| musl.cc gcc is 11.2.1; building from 13.2.0 may produce slightly different code | The compiler version difference is acceptable — we're building the same *target* binaries, just with a newer host compiler. Output hashes for downstream recipes will change but should still be correct. |
| Round-trip hashes won't match on first try | Expected. Phase 7 documents gaps. Perfect reproducibility is a separate project. |
| Path references in seed-root are hardcoded to `x86_64-linux-musl-native/` | The `seed-root.ts` script uses this path explicitly. Either match it in the new toolchain or update seed-root. |

## Estimated Effort

| Phase | Effort | Notes |
|-------|--------|-------|
| Phase 1: musl libc | Low (~30 min) | Small, clean codebase. Standard configure/make. |
| Phase 2: binutils | Low (~30 min) | Straightforward cross build. |
| Phase 3: gcc | Medium (~1-2 hrs) | GCC build is complex but well-documented. May need iteration on configure flags. |
| Phase 4: assembly | Low (~30 min) | Mechanical. Main risk is path mismatches. |
| Phase 5: wiring in | Low (~30 min) | Single-point change, but cascading rebuild is slow. |
| Phase 6: busybox from source | Low (~30 min) | Pattern already proven in `busybox-native.ts`. |
| Phase 7: round-trip | Medium (~1-2 hrs) | First attempt will likely fail. Investigation time. |

**Total: ~4-6 hours of focused work, spread across multiple rebuild cycles.**

## Order of Execution

Recommended order to minimize rebuild time and maximize early validation:

1. **Phase 1 first** — smallest, validates the pattern
2. **Phase 2** — builds on Phase 1
3. **Phase 3** — builds on Phases 1 + 2 (this is the slow step)
4. **Phase 4** — assembly (quick)
5. **Phase 5** — wire in (this triggers a full cascade rebuild)
6. **Phase 6** — busybox from source (can be done in parallel with Phase 5 validation)
7. **Phase 7** — round-trip (depends on everything else being done)

Phases 1–3 can be validated independently without affecting the existing pipeline.
Phase 5 is the point where we commit to the new toolchain.
