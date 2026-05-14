# Plan: Standardize Shared Library Stripping in Build Profiles

**Status:** Active cleanup candidate  
**Current authority:** this plan plus `recipes/helpers/strip.ts` and current package recipes

## Motivation

30 recipe files manually strip `.so` files with bare `strip` (no flags),
4 use `strip --strip-unneeded`, and 1 (gtk3) strips nothing. This is
duplicated boilerplate with inconsistent behavior.

Bare `strip` on shared libraries removes the `.symtab` (debug symbol table)
but preserves `.dynsym` and `.dynstr` (dynamic linking symbols). It's not
broken, but `--strip-unneeded` is semantically correct for shared libraries
and safer — it's designed specifically for objects that will be used by
other linkers.

Better: centralize this in the build profile helpers (`cProfile` and
`mesonProfile`) so individual recipes don't think about it.

## Current State

### bare `strip` recipes (30 files)
```
jq, libXau, libXdmcp, libxcb, libX11, libXext, libXfixes, libXrender,
libXi, libXrandr, libXcursor, libXinerama, libXdamage, libXcomposite,
libpng, freetype, fontconfig, harfbuzz, glib, pixman, cairo, fribidi,
pango, gdk-pixbuf, atk, shared-mime-info, libepoxy, libXtst, dbus,
at-spi2-core
```

### `strip --strip-unneeded` (4 files)
```
openssl, curl, file, python
```

### No strip (1 file)
```
gtk3 (strips bin/ only, skips .so files)
```

## Proposed Change

### `recipes/helpers/c.ts` — add strip to cProfile

```typescript
// In cProfile(), add to the env or as a post-build convention:
// Recipes will have:
//   $STRIP = "/deps/toolchain/bin/strip"
// Post-build strip convention (documented, but recipes are responsible
// for calling it — similar to how LDFLAGS patterns are documented).

// Actually, better: add a `postBuild` or `postInstall` helper that
// recipes include in their script block.
```

**Wait** — `cProfile` only sets environment variables. It can't inject
commands into the script. The recipes' scripts are free-form shell.

**Better approach**: Create a small helper function that returns a
shell snippet string, which recipes include in their script block:

```typescript
// recipes/helpers/strip.ts
export const STRIP_BINARIES = `
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
`;
export const STRIP_LIBRARIES = `
find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip --strip-unneeded {} + 2>/dev/null || true
`;
export const STRIP_ALL = `
${STRIP_BINARIES}
${STRIP_LIBRARIES}
rm -rf $OUT/share/doc $OUT/share/gtk-doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`;
```

Then recipes use it:

```typescript
import { STRIP_ALL } from "../../helpers/strip.js";

script: `
  ...build commands...
  DESTDIR=$OUT make install
  ${STRIP_ALL}
`,
```

This is opt-in and doesn't break existing recipes. Over time, recipes
migrate from their manual strip lines to the imported constant.

### Alternative: Add a `postInstall` option to `shellBuild`

This would be a core change to the TypeScript SDK — add a `postInstall`
field that runs after the main script:

```typescript
const recipe = await shellBuild({
  ...cProfile({...}),
  script: `...`,
  postInstall: STRIP_ALL,  // shell snippet run after script succeeds
  deps: [...],
});
```

This is cleaner but requires SDK changes. Defer to a separate plan.

## Implementation

### Step 1: Create `recipes/helpers/strip.ts`

```typescript
//! Standard stripping snippets for Hod recipes.
//!
//! Import these constants and use them in your shellBuild script block
//! to strip binaries and shared libraries consistently.
//!
//! Usage:
//!   import { STRIP_ALL } from "../../helpers/strip.js";
//!   shellBuild({ script: `...\nDESTDIR=\$OUT make install\n\${STRIP_ALL}\n`, ... });

export const STRIP = "/deps/toolchain/bin/strip";

export const STRIP_BINARIES = `
find $OUT/bin -type f -exec ${STRIP} {} + 2>/dev/null || true
`;

export const STRIP_LIBRARIES = `
find $OUT/lib -name '*.so*' -exec ${STRIP} --strip-unneeded {} + 2>/dev/null || true
`;

export const STRIP_ALL = `
${STRIP_BINARIES}
${STRIP_LIBRARIES}
rm -rf $OUT/share/doc $OUT/share/gtk-doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`;
```

### Step 2: Migrate one recipe as a test

Pick a small recipe (e.g., `zlib` or `expat`) and rewrite its strip
line to use `STRIP_ALL`. Verify it builds with an identical output hash
(bit-for-bit identical output).

**Why output hash should be identical:** The only difference is
`--strip-unneeded` vs bare `strip` on `.so` files. For shared libraries
that only reference symbols from other shared libraries, both produce
the same result. If the output hash changes, investigate why.

### Step 3: If hashes are identical, bulk-migrate

Run a script that replaces the manual strip lines in all 30 recipes
with `STRIP_ALL`. Rebuild affected recipes. Since hashes are identical,
no downstream rebuilds are needed.

### Step 4: If hashes differ, migrate incrementally

If `--strip-unneeded` produces different output from bare `strip`,
migrate recipes one by one as they're touched for other reasons.

## Files to Create/Change

| File | Action |
|------|--------|
| `recipes/helpers/strip.ts` | Create |
| `recipes/helpers/c.ts` | Add import of `STRIP` constant to env (optional) |
| 30 recipe files | Replace manual strip lines with `${STRIP_ALL}` |

## Rebuild Impact

If the strip approach produces identical hashes (likely):
- **0 recipes need rebuilding** — output is bit-for-bit identical.

If hashes differ:
- **30 recipes re-evaluated** (new recipe hashes).
- Their downstream consumers' recipe hashes change (new dep hashes).
- **~50 total recipes rebuilt** (the 30 plus their transitive consumers).

The verification step (Step 2) determines which path we take.

## Rollback Plan

If the centralized approach causes issues:

1. **Revert individual recipes** — import of STRIP_ALL → original inline
   strip command. One recipe at a time, no system-wide impact.
2. **The helper file itself has no effect** until recipes import it. It
   can be deleted without affecting any existing recipe.
3. **If hashes differ** and it causes a cascade rebuild we don't want,
   simply don't merge to existing recipes — use STRIP_ALL only in new
   recipes going forward.

## Estimate

~30 minutes to create `strip.ts` + verify one recipe + bulk-migrate if
hashes are identical. If hashes differ, the incremental approach means
no time pressure.
