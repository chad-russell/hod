# Plan: Go Language Support for Hod

**Status:** Implemented; historical design record  
**Date:** 2026-05-11  
**Current authority:** `recipes/helpers/go.ts`, `recipes/native/go/`, current source/tests  
**Scope:** Go toolchain installation, `goBuild` helper, test recipes

## Background

Hod has mature C support (`cProfile` / `shellBuild`) and Rust support
(`cargoBuild`). Go is the third language target. The prebuilt Go toolchain is
fully statically linked (verified: `readelf -l` shows no `PT_INTERP` or
`PT_DYNAMIC`), which makes it simpler than Rust — the toolchain itself needs
zero runtime deps and no relocation.

Go programs have three linking modes with different implications:

| Mode | Output | `runtime_deps` | ELF Relocation |
|------|--------|-----------------|----------------|
| `CGO_ENABLED=0` | Static binary | None | No |
| `CGO_ENABLED=1` (stdlib only) | Dynamic, links glibc | `["toolchain"]` | Yes |
| `CGO_ENABLED=1` + C libs | Dynamic, links glibc + libs | `["toolchain", ...]` | Yes |

Most Go programs default to `CGO_ENABLED=0`. The helper will default to
static builds and opt into CGO only when requested.

No core Rust changes are required. Everything lives in TypeScript recipe
helpers and recipe files, following the established pattern from
`recipes/helpers/rust.ts`.

---

## File Layout

```
recipes/
  native/go/
    go-source.ts              # Phase 1: download prebuilt tarball
    go.ts                     # Phase 1: install toolchain into store
    hello-go/
      hello-go.ts             # Phase 3: CGO_ENABLED=0 test
    hello-go-cgo/
      hello-go-cgo.ts         # Phase 3: CGO_ENABLED=1 test
  helpers/
    go.ts                     # Phase 2: goProfile() + goBuild()
```

---

## Phase 1: Go Toolchain Recipe

### 1.1 Create `recipes/native/go/go-source.ts`

- [x] Create directory `recipes/native/go/`
- [x] Write `go-source.ts` using `fetchTarball()`
  - URL: `https://go.dev/dl/go1.24.3.linux-amd64.tar.gz`
  - BLAKE3 hash: `b9f80dbdf72809d7f94ba930777154a7d444196a74d11219822b0aeaee6f6c8c`
  - `fetchTarball` handles download + unpack with strip-components=1

**Verification:**

```bash
cd /home/crussell/hod
export PATH="$PWD/target/debug:$PATH"
BUN=/nix/store/vmhlm86h4c9gxzrczqd91hwfz2kkfn25-bun-1.3.11/bin/bun

$BUN run recipes/native/go/go-source.ts
# Should print recipe hash and succeed without error
```

### 1.2 Create `recipes/native/go/go.ts`

- [x] Write `go.ts` using `shellBuild` with `cProfile()`
- [x] Script extracts the prebuilt Go tree to `$OUT`:
  - `cp -a /deps/go-source/. $OUT`
- [x] Strip docs and test data:
  - `rm -rf $OUT/doc $OUT/test $OUT/misc $OUT/codereview.cfg`
  - `rm -f $OUT/CONTRIBUTING.md $OUT/README.md $OUT/SECURITY.md $OUT/PATENTS`
- [x] Keep `src/` and `pkg/` — needed for `go install` of stdlib tools
- [x] `runtime_deps: []` — toolchain is fully static, no glibc needed
- [x] No zlib or ca-certificates deps needed (unlike Rust)

**Template:**

```typescript
//! Go toolchain — prebuilt binary installation.
//!
//! Installs the official Go 1.24.3 prebuilt binaries. The Go toolchain is
//! fully statically linked (no glibc dependency), so no runtime_deps are
//! needed for the toolchain itself.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { goSourceRecipe } from "./go-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `
cp -a /deps/go-source/. $OUT

# Remove non-essential files to save space
rm -rf $OUT/doc $OUT/test $OUT/misc $OUT/codereview.cfg
rm -f $OUT/CONTRIBUTING.md $OUT/README.md $OUT/SECURITY.md $OUT/PATENTS

# Verify the toolchain works
/deps/go-source/bin/go version

echo "=== Go toolchain installed ==="
ls -la $OUT/bin/
`,
  deps: [
    dep("go-source", goSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  // No runtime_deps — Go toolchain is fully static.
});

await importToStore(recipe);
export const goRecipe = recipe;
```

**Verification:**

```bash
$BUN run recipes/native/go/go-source.ts
$BUN run recipes/native/go/go.ts

HASH=$($BUN -e "
import { goRecipe } from './recipes/native/go/go.js';
console.log(goRecipe.hash);
")

# Build the toolchain recipe
hod build --hash $HASH

# Verify the output
# (use the output hash from the build output above)
hod ls-output <output-hash>

# Expected: bin/go, bin/gofmt, pkg/, src/, lib/, api/, go.env, VERSION
# Should NOT have: doc/, test/, misc/
```

**Smoke test — run the built Go binary from the store:**

```bash
# Find the output staging directory
OUTPUT_DIR=$(find ~/.local/share/hod/staging -path "*/bin/go" -newer /tmp/go1.24.3.linux-amd64.tar.gz -exec dirname {} \; | head -1)
echo "Output dir: $OUTPUT_DIR"

# The Go binary should run directly (it's static, no linker needed)
$OUTPUT_DIR/go version
# Expected: go version go1.24.3 linux/amd64
```

**Result: ✅ All Phase 1 checks pass.**
- Output hash: `2997b1565a060e0c35616b11973f210c136321a1d866fae36c2b312b64807992`
- `go version go1.24.3 linux/amd64` runs from store
- Output: 261MB, contains `bin/go`, `bin/gofmt`, `pkg/`, `src/`, `lib/`, `api/`, `VERSION`, `go.env`, `LICENSE`
- No `doc/`, `test/`, `misc/` (cleaned up)
- No runtime_deps needed

---

## Phase 2: Go Build Helper

### 2.1 Create `recipes/helpers/go.ts`

- [x] Implement `goProfile()` — environment setup for Go builds
- [x] Implement `goBuild()` — convenience wrapper around `shellBuild`
- [x] Export both functions

**`goProfile()` specification:**

```typescript
interface GoProfileOptions {
  /** Dep name for the C toolchain bundle (default: "toolchain"). */
  tc?: string;
  /** Dep name for the Go toolchain (default: "go"). */
  go?: string;
  /** Enable CGO (default: false). */
  cgo?: boolean;
}
```

Returns `{ shell, preamble, env }`:

| Field | `cgo: false` | `cgo: true` |
|-------|-------------|-------------|
| `shell` | `/deps/<tc>/bin/busybox` | `/deps/<tc>/bin/busybox` |
| `preamble` | none | `hermeticPreamble({ shell: tc, glibcLinker: tc })` |
| `PATH` | `/deps/<go>/bin:/deps/<tc>/bin` | same |
| `GOROOT` | `/deps/<go>` | same |
| `GOCACHE` | `/tmp/.go-cache` | same |
| `GOPATH` | `/tmp/.go-path` | same |
| `CGO_ENABLED` | `"0"` | `"1"` |
| `CC` | not set | `/deps/<tc>/bin/gcc --sysroot=...` |
| `HOD_DUMMY_RPATH` | not set | `HOD_DUMMY_RPATH_FLAG` |
| `CGO_LDFLAGS` | not set | includes `$HOD_DUMMY_RPATH` |

**`goBuild()` specification:**

```typescript
interface GoBuildOptions {
  /** Binary name (used for -o and output path). */
  name: string;

  /** BuiltRecipe for the C toolchain (gcc + glibc + busybox). */
  toolchain: BuiltRecipe;

  /** BuiltRecipe for the Go toolchain (go compiler). */
  goToolchain: BuiltRecipe;

  /** Source dependency name. When provided, builds from /deps/<source>. */
  source?: string;

  /** Inline Go source code (for test recipes). Requires `name`. */
  mainGo?: string;

  /** Additional source files: { "pkg/foo/foo.go": "..." }. */
  extraFiles?: Record<string, string>;

  /** Named dependencies (excluding toolchain and go, auto-injected). */
  deps: ProcessDependency[];

  /** Enable CGO (default: false). */
  cgo?: boolean;

  /** Runtime dependencies for ELF relocation. Auto-set if not provided:
   *   cgo=false → [], cgo=true → ["toolchain"]. */
  runtime_deps?: string[];

  /** Environment variables (merged with goProfile defaults). */
  env?: Record<string, string> | EnvEntry[];

  /** Additional go build flags (e.g., "-tags", "netgo"). */
  buildFlags?: string[];

  /** Go linker flags (e.g., "-X", "main.version=1.0"). */
  ldflags?: string[];

  /** Bitmask of unsafe flags. Bit 0 = allow networking. */
  unsafe_flags?: number;
}
```

**`goBuild()` behavior:**

1. Validates required options (`name`, `toolchain`, `goToolchain`).
2. If no `source`, requires `mainGo` (inline code pattern).
3. Auto-injects `dep("toolchain", ...)` and `dep("go", ...)`.
4. Merges user env over `goProfile()` defaults.
5. Auto-sets `runtime_deps` if not provided:
   - `cgo: false` → `[]`
   - `cgo: true` → `["toolchain"]`
6. Prepares source:
   - If `source`: copies from `/deps/<source>/` to `/tmp/build/`
   - If `mainGo`: writes inline files to `/tmp/build/`
7. Always writes `/tmp/build/go.mod` for inline code (minimal module).
8. Runs `go build -o $OUT/bin/<name> [ldflags] [buildFlags] .`
9. Strips the output binary.

**Verification:**

```bash
# The helper itself is TypeScript — just verify it parses without error
$BUN -e "
import { goProfile, goBuild } from './recipes/helpers/go.js';
console.log('goProfile:', typeof goProfile);
console.log('goBuild:', typeof goBuild);
"
# Expected: goProfile: function, goBuild: function
```

---

## Phase 3: Test Recipes

### 3.1 Create `recipes/native/go/hello-go/hello-go.ts` (CGO_ENABLED=0)

- [x] Write test recipe with inline Go source
- [x] No CGO, no network, no runtime deps
- [x] Produces a fully static binary

```typescript
//! Test recipe: hello-world Go binary (CGO_ENABLED=0).
//!
//! Validates that goBuild can compile and run a pure Go binary.
//! Output should be a statically-linked ELF with no runtime deps.

import {
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { goRecipe } from "../go.js";
import { goBuild } from "../../../helpers/go.js";

const recipe = await goBuild({
  name: "hello-go",
  toolchain: nativeToolchainRecipe,
  goToolchain: goRecipe,
  mainGo: `package main

import "fmt"

func main() {
    fmt.Println("hello from hod-built go!")
}
`,
  deps: [],
  // cgo: false (default)
  // runtime_deps: [] (auto-set)
});

await importToStore(recipe);
export const helloGoRecipe = recipe;
```

**Verification:**

```bash
$BUN run recipes/native/go/hello-go/hello-go.ts

HASH=$($BUN -e "
import { helloGoRecipe } from './recipes/native/go/hello-go/hello-go.js';
console.log(helloGoRecipe.hash);
")

hod build --hash $HASH

# Verify output contains a static binary
# ldd should report "not a dynamic executable"
```

### 3.2 Create `recipes/native/go/hello-go-cgo/hello-go-cgo.ts` (CGO_ENABLED=1)

- [x] Write test recipe using CGO to call a C function
- [x] Links dynamically to glibc
- [x] Tests the full ELF relocation pipeline with Go output

```typescript
//! Test recipe: hello-world Go binary with CGO.
//!
//! Validates that goBuild with cgo: true produces a correctly
//! relocated dynamic binary. The output links against glibc and
//! requires runtime_deps: ["toolchain"].

import {
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { goRecipe } from "../go.js";
import { goBuild } from "../../../helpers/go.js";

const recipe = await goBuild({
  name: "hello-go-cgo",
  toolchain: nativeToolchainRecipe,
  goToolchain: goRecipe,
  mainGo: `package main

/*
#include <stdio.h>
void say_hello() {
    printf("hello from C via CGO!\\n");
}
*/
import "C"

func main() {
    C.say_hello()
}
`,
  deps: [],
  cgo: true,
  // runtime_deps: ["toolchain"] (auto-set when cgo: true)
});

await importToStore(recipe);
export const helloGoCgoRecipe = recipe;
```

**Verification:**

```bash
$BUN run recipes/native/go/hello-go-cgo/hello-go-cgo.ts

HASH=$($BUN -e "
import { helloGoCgoRecipe } from './recipes/native/go/hello-go-cgo/hello-go-cgo.js';
console.log(helloGoCgoRecipe.hash);
")

hod build --hash $HASH

# Verify:
# 1. Build succeeds (relocation pass runs)
# 2. Output has bin/hello-go-cgo
# 3. Binary should be dynamically linked (has PT_INTERP)
# 4. Binary should run from the store with relocated RUNPATH
```

---

## Phase 4: Documentation Updates

- [ ] Update `docs/agent-package-guide.md`:
  - Add a "Building Go Packages with `goBuild`" section (analogous to the Rust section)
  - Add Go to the reference table of existing recipes by build system
  - Document the `cgo: false` default and when to opt into `cgo: true`
- [ ] Update `docs/recipe-compiler-guide.md`:
  - Add `goProfile` / `goBuild` to the helpers list
  - Update the project layout section
- [ ] Update `NEXT_PACKAGES.md`:
  - Add a "Go packages" section with initial targets (e.g., `gh` CLI, `hugo`)

---

## Verification Checklist (Complete After All Phases)

- [ ] `go-source.ts` imports successfully
- [ ] `go.ts` builds successfully — toolchain output has `bin/go`, `bin/gofmt`
- [ ] Built `go` binary runs and reports `go version go1.24.3 linux/amd64`
- [ ] `goProfile()` returns correct env for both `cgo: false` and `cgo: true`
- [ ] `hello-go.ts` (CGO_ENABLED=0) builds successfully
- [ ] `hello-go` binary is statically linked (`ldd`: "not a dynamic executable")
- [ ] `hello-go` binary runs and prints "hello from hod-built go!"
- [ ] `hello-go-cgo.ts` (CGO_ENABLED=1) builds successfully
- [ ] `hello-go-cgo` binary is dynamically linked (has `PT_INTERP`)
- [ ] `hello-go-cgo` binary runs and prints "hello from C via CGO!"
- [ ] Relocation pass reports fixups for the CGO binary
- [ ] Documentation is updated

---

## Design Decisions (For Reference)

1. **Go 1.24.3** — current stable release.
2. **Conservative toolchain cleanup** — keep `src/` and `pkg/`; only remove docs/tests/misc.
3. **Default `GOPROXY`** — leave Go's default proxy settings unchanged.
4. **Bootstrap from source deferred** — use prebuilt binaries; self-bootstrapping is future work.
5. **`CGO_ENABLED=0` default** — matches Go ecosystem norms; most Go programs are static.
6. **No core Rust changes** — everything in TypeScript helpers, following the Rust pattern.
