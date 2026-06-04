# Plan: Standardize Shared Library Stripping in Build Profiles

**Status:** DONE
**Current authority:** `recipes/helpers/strip.ts` and current package recipes

## What's Done

- `recipes/helpers/strip.ts` created with `STRIP`, `STRIP_BINARIES`, `STRIP_LIBRARIES`, `STRIP_ALL`, and `RELOCATE_PKG_CONFIG`
- `STRIP_BINARIES` expanded to cover `$OUT/bin`, `$OUT/sbin`, `$OUT/libexec`
- All toolchain-era recipes migrated to use helpers (14 files)
  - rust, llvm — switched to `STRIP_BINARIES`
  - harfbuzz, cairo, wayland, pango — removed redundant inline strip
  - git, glib, procps-ng, openssh, shared-mime-info — removed inline strip now covered by expanded helpers
  - python, wireplumber — use `STRIP` constant for special-case dirs
  - nnn — uses `STRIP` constant for build-time Makefile variable
- `caCertEnv()` migration 100% complete (all 34 recipes use the helper)
- `cxx: true` migration 100% complete (no recipe manually exports `CXX`)
- spirv-tools, spirv-llvm-translator now strip their outputs

## Remaining (low priority, migrate when touching)

### Seed-era recipes (~16 files)

These use `/deps/seed/bin/strip` and run under the seed toolchain. The helpers
reference `/deps/toolchain/bin/strip` which doesn't exist in the seed
environment. These can only be migrated if a seed-aware strip constant is added,
or if the seed path is aliased. Not urgent — these are bootstrap-only recipes.

### bindgen-clang

Installs unstripped `libclang.so*` and `libLLVM.so*`. These are prebuilt
binaries where stripping risks removing symbols needed by downstream tools.
