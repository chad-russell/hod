**ARCHIVED:** This plan is superseded by `plans/bootstrap-roadmap.md` (the single source of truth). This file is kept for historical reference only.

# Native Busybox and shellBuild() Plan

**Status:** Planning — awaiting implementation  
**Depends on:** gcc-stage2 bootstrap plan (complete)  
**Goal:** Remove the bootstrap seed from user-facing recipes by adding a statically-linked
busybox to the native toolchain, and simplify recipe authoring with a `shellBuild()` SDK helper.

## 1. Motivation

Currently every user recipe (ncurses, cbonsai) declares seed as a dependency:

```ts
dependencies: [
  dep("seed", seedRootRecipe),                    // provides executor + musl linker
  dep("toolchain", nativeToolchainRecipe),         // provides gcc, glibc, sysroot
  dep("source", sourceRecipe),
]
```

The native toolchain already contains Hod-built bash, coreutils, make, sed, grep — all
glibc-linked. It does **not** contain a statically-linked shell, which is why recipes
still need seed's `busybox` as the executor.

Seed should be invisible to user recipes. It exists in the transitive bootstrap chain
(it built gcc-stage1 → gcc-stage2 → native-toolchain), but user recipes should never
reference it.

## 2. The Fix in Two Parts

### Part A: Statically-linked busybox in the native toolchain

Build busybox from source using the native toolchain's gcc-stage2, statically linked.
Bundle it in `native-toolchain`. Now `/deps/toolchain/bin/busybox` is available.
No dynamic linker needed — the kernel loads it directly.

### Part B: `shellBuild()` SDK helper

The current recipe boilerplate repeats the same pattern across every recipe:

```ts
const preamble = hermeticPreamble({ shell: "...", glibcLinker: "..." });

const recipe = await process({
  command: "/deps/.../bin/busybox",
  args: ["sh", "-c", `set -e\n${preamble}\n...actual build script...`],
  env: [{ key: "C_INCLUDE_PATH", value: "" }],
  dependencies: [...],
});
```

A `shellBuild()` helper encapsulates this. The common case becomes:

```ts
const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `./configure --prefix=/ && make -j$(nproc) && make install DESTDIR=$OUT`,
  env: [...],
  deps: [dep("toolchain", nativeToolchainRecipe), dep("source", sourceRecipe)],
});
```

## 3. New Recipe: busybox-native

### 3.1 Source download

Create `recipes/toolchain/busybox-source.ts`:

```ts
import { download, importToStore } from "../../js/src/index.js";

const recipe = await download({
  url: "https://busybox.net/downloads/busybox-1.36.1.tar.bz2",
  hash: "<computed after first download>",
});

await importToStore(recipe);
export const busyboxSourceRecipe = recipe;
```

Version: 1.36.1 (recent stable, same major era as the seed's busybox).

### 3.2 Build recipe

Create `recipes/toolchain/busybox-native.ts`:

```ts
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { nativeToolchainRecipe } from "./native-toolchain.js";
import { busyboxSourceRecipe } from "./busybox-source.js";

const preamble = hermeticPreamble({
  shell: "seed",
  muslLinker: "seed",
  sysroot: { glibc: "toolchain", linuxHeaders: "toolchain" },
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: ["sh", "-c", `set -e
${preamble}

tar xf /deps/source/source -C /tmp
cd /tmp/busybox-1.36.1

# Minimal static config
make defconfig
# Enable static linking
echo "CONFIG_STATIC=y" >> .config
# Answer 'yes' to any new config prompts
yes "" | make oldconfig

# Build with the native toolchain
make -j$(nproc) \\
  CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin" \\
  CFLAGS="-O2 -static"

# Install just the busybox binary
mkdir -p $OUT/bin
cp busybox $OUT/bin/busybox
chmod +x $OUT/bin/busybox`],
  env: [{ key: "C_INCLUDE_PATH", value: "" }],
  dependencies: [
    dep("seed", seedRootRecipe),
    dep("source", busyboxSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const busyboxNativeRecipe = recipe;
```

**Why seed is still needed *here*:** This recipe builds busybox, so it can't use the
busybox it's building as its own executor. Seed provides the shell for this one
bootstrap recipe. After this recipe completes, `busybox-native` is a native-toolchain
artifact.

**Config notes:**
- `make defconfig` gives a reasonable default set of applets (includes `sh`, `ln`,
  `mkdir`, `cp`, `cat`, `echo`, `basename`, `test`, `[`, etc.)
- `CONFIG_STATIC=y` produces a binary with no ELF interpreter dependency
- The binary is linked against glibc (statically), not musl

### 3.3 Verification

After building, verify with readelf:

```
$ hod build --hash <busybox-native-hash>
$ readelf -l <staging>/busybox-native/.../bin/busybox | grep INTERP
# (should produce NO output — no PT_INTERP segment means static)
```

## 4. Update native-toolchain to bundle busybox-native

Edit `recipes/toolchain/native-toolchain.ts`:

Add import:
```ts
import { busyboxNativeRecipe } from "./busybox-native.js";
```

Add to dependencies:
```ts
dep("busybox-native", busyboxNativeRecipe),
```

Add to bundle script (after coreutils, before convenience symlinks):
```sh
# Overlay native busybox (statically linked, replaces seed's busybox)
cp -a /deps/busybox-native/bin/busybox $OUT/bin/busybox
```

The toolchain's `bin/busybox` is now a statically-linked, Hod-built binary.
Downstream recipes can use `command: "/deps/toolchain/bin/busybox"` with no
dynamic linker dependency.

## 5. Add `shellBuild()` to the SDK

### 5.1 New file: `js/src/shell.ts`

```ts
import { process, dep } from "./index.js";
import { hermeticPreamble, type HermeticPreambleOptions } from "./preamble.js";
import type { ProcessDefinition, EnvEntry } from "./process.js";
import type { ProcessDependency } from "./dep.js";
import type { BuiltRecipe } from "./file.js";

export interface ShellBuildOptions {
  /** Dep name providing the shell + glibc runtime (e.g., "toolchain"). */
  toolchain: string;

  /** The build script (shell commands). Wrapped in set -e + preamble. */
  script: string;

  /** Environment variable overrides (passed to process()). */
  env?: Record<string, string> | EnvEntry[];

  /** Dependencies (passed to process()). The toolchain dep is added automatically. */
  deps?: ProcessDependency[];
}

/**
 * Create a Process recipe that runs a shell build script.
 *
 * Wraps the script in `set -e` and the hermetic preamble. Uses the
 * statically-linked busybox from the named toolchain as the executor.
 *
 * ```ts
 * const recipe = await shellBuild({
 *   toolchain: "toolchain",
 *   script: "./configure && make && make install DESTDIR=$OUT",
 *   deps: [dep("source", sourceRecipe)],
 * });
 * ```
 */
export async function shellBuild(opts: ShellBuildOptions): Promise<BuiltRecipe> {
  const preamble = hermeticPreamble({
    shell: opts.toolchain,
    glibcLinker: opts.toolchain,
    // no muslLinker — nothing in user recipes is musl-linked
  });

  const fullScript = `set -e\n${preamble}\n${opts.script}`;

  return await process({
    platform: "x86_64-linux",
    command: `/deps/${opts.toolchain}/bin/busybox`,
    args: ["sh", "-c", fullScript],
    env: [
      { key: "C_INCLUDE_PATH", value: "" },
      ...(Array.isArray(opts.env) ? opts.env : []),
    ],
    dependencies: [...(opts.deps ?? [])],
  });
}
```

### 5.2 Export from `js/src/index.ts`

```ts
export { shellBuild } from "./shell.js";
export type { ShellBuildOptions } from "./shell.js";
```

## 6. Migrate ncurses and cbonsai

### 6.1 ncurses

Replace the current explicit `process()` call with `shellBuild()`:

```ts
import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesSourceRecipe } from "./ncurses-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `
tar xf /deps/source/source -C /tmp
cd /tmp/ncurses-6.6

export PATH=/deps/toolchain/bin
export CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export AR=/deps/toolchain/bin/ar
export RANLIB=/deps/toolchain/bin/ranlib
export STRIP=/deps/toolchain/bin/strip
export CFLAGS="-O2"
export LDFLAGS="-static"

./configure \\
  --srcdir=. \\
  --prefix=/ \\
  --disable-shared \\
  --enable-static \\
  --enable-widec \\
  --without-debug \\
  --without-ada \\
  --without-manpages \\
  --without-tests \\
  --without-cxx-binding \\
  --disable-stripping

make -j$(nproc)
make install DESTDIR=$OUT

# Non-widec compatibility symlinks
cd $OUT/lib
for f in lib*w.a lib*w.so; do
  [ -e "$f" ] || continue
  ln -sf "$f" "$(echo "$f" | sed 's/w//')"
done
if [ -d $OUT/lib/pkgconfig ]; then
  cd $OUT/lib/pkgconfig
  for f in *.pc; do
    ln -sf "$f" "$(echo "$f" | sed 's/w//')"
  done
fi`,
  deps: [
    dep("source", ncursesSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const ncursesRecipe = recipe;
```

Key changes:
- No `import { seedRootRecipe }` — seed is gone
- No `dep("seed", ...)` — no seed in deps
- No explicit `hermeticPreamble()` call — `shellBuild` handles it
- No `C_INCLUDE_PATH` env override — `shellBuild` handles it
- No explicit `command`/`args`/`platform` — `shellBuild` handles it

### 6.2 cbonsai

Same pattern:

```ts
import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { cbonsaiSourceRecipe } from "./cbonsai-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `
tar xf /deps/source/source -C /tmp
cd /tmp/cbonsai-v1.4.2

export PATH=/deps/toolchain/bin

make cbonsai \\
  CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin" \\
  CFLAGS="-O2 -I/deps/ncurses/include -I/deps/ncurses/include/ncursesw" \\
  LDFLAGS="-static -L/deps/ncurses/lib" \\
  LDLIBS="-lpanelw -lncursesw"

mkdir -p $OUT/bin
cp cbonsai $OUT/bin/cbonsai
chmod +x $OUT/bin/cbonsai`,
  deps: [
    dep("ncurses", ncursesRecipe),
    dep("source", cbonsaiSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const cbonsaiRecipe = recipe;
```

## 7. Downstream Recipe Author Experience

After this work, a new recipe (e.g., `zlib`) is:

```ts
import { shellBuild, dep, importToStore } from "../js/src/index.js";
import { nativeToolchainRecipe } from "../toolchain/native-toolchain.js";
import { zlibSourceRecipe } from "./zlib-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `
tar xf /deps/source/source -C /tmp
cd /tmp/zlib-1.3.1

export CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"

./configure --prefix=/ --static
make -j$(nproc)
make install DESTDIR=$OUT`,
  deps: [
    dep("source", zlibSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const zlibRecipe = recipe;
```

No seed. No preamble boilerplate. No `hermeticPreamble()` call. Just the build script
and its declared deps.

## 8. Implementation Task List

### Phase 1: Native busybox

1. Create `recipes/toolchain/busybox-source.ts` — download busybox 1.36.1 source
2. Create `recipes/toolchain/busybox-native.ts` — static build with native toolchain
3. Build and verify: `readelf -l buskbox | grep INTERP` should show no output
4. Update `recipes/toolchain/native-toolchain.ts`:
   - Add `busybox-native` to dependencies
   - Copy busybox binary into `$OUT/bin/`
5. Rebuild native-toolchain (this cascades to all downstream recipes)

### Phase 2: shellBuild() helper

6. Create `js/src/shell.ts` — `shellBuild()` function
7. Export from `js/src/index.ts`
8. Write a simple test or smoke-test with a trivial recipe

### Phase 3: Migrate existing recipes

9. Rewrite `recipes/native/ncurses/ncurses.ts` with `shellBuild()`, drop seed
10. Rewrite `recipes/native/cbonsai/cbonsai.ts` with `shellBuild()`, drop seed
11. Build and verify both

### Phase 4: Cleanup

12. Verify `preamble.ts` no longer needs `muslLinker` in the `shellBuild` path
    (keep `muslLinker` option — seed recipes still use it)
13. Update `plans/gcc-stage2-bootstrap-plan.md` success criteria
14. Optionally: suppress `hod: open interp` spam in `src/relocate.rs`

## 9. Verification Checklist

After all phases, verify:

- [ ] `busybox-native` builds and is statically linked (no PT_INTERP)
- [ ] `native-toolchain` rebuild completes with busybox-native included
- [ ] `busybox --help` runs inside a sandbox with no dynamic linker setup
- [ ] `ncurses` recipe file contains zero references to `seed`
- [ ] `cbonsai` recipe file contains zero references to `seed`
- [ ] Both ncurses and cbonsai build successfully
- [ ] Output hashes for ncurses and cbonsai match (or expected to differ due
      to toolchain changes)
- [ ] `shellBuild()` throws clear errors for missing required fields
- [ ] A downstream recipe author can create a new package without ever
      importing `hermeticPreamble` or `seedRootRecipe`

## 10. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `make defconfig` on busybox might not include needed applets | Check the default config; if `sh` or core applets are missing, use a pre-saved config fragment |
| Static glibc linking produces large binary | Busybox is ~2-3MB static — acceptable for a build executor |
| `shellBuild` hides too much, making debugging harder | Keep the `process()` low-level API available. `shellBuild` is a convenience, not a replacement |
| Recipe hash cascade from toolchain change | One-time cost. All downstream recipes must rebuild anyway when the toolchain executor changes |
| `busybox-native.ts` still uses seed as executor | Bootstrap recipe. Once built, it seeds the toolchain, and the circular dependency is broken for all downstream recipes |

## 11. Non-goals

- Do not remove `muslLinker` from `hermeticPreamble`. Seed-based recipes (cross, shims,
  bootstrap) still need it.
- Do not remove the low-level `process()` API. `shellBuild` is additive.
- Do not build a static bash. `busybox sh` (ash) is sufficient for all current recipes.
- Do not handle non-shell executors (Python, Node). That's a separate feature.

## 12. Dependency Graph After Migration

```
seed
  └── gcc-stage1 ──┐
                   ├── gcc-stage2 ──┐
                   │                ├── native-toolchain
                   │                │     ├── busybox (static)  ← NEW
                   │                │     ├── bash, coreutils, make, ...
                   │                │     └── glibc sysroot
                   │                │
                   │                └── ncurses
                   │                      └── cbonsai
                   │
                   └── busybox-native     ← bootstrap-only recipe
                        (uses seed as executor)
```

Key: **no edge from ncurses/cbonsai to seed**. Seed is only in the bootstrap chain
and the busybox-native recipe (which builds the self-hosting executor).
