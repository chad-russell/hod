# Agent Guide: Adding and Building Packages

This guide enables agents to (a) propose new packages for the build graph, and (b) implement packages from the prioritized list. Read it fully before starting either task.

---

## 1. How Hod Works (Executive Summary)

Hod is a **deterministic, content-addressed build system**. Key concepts:

- **Recipes** are TypeScript files in `recipes/` that encode build instructions into a binary format imported to the Hod store (SQLite + sharded filesystem blobs).
- **The store** lives at `$HOD_STORE` or `$XDG_DATA_HOME/hod`. Outputs are staged at `<store>/staging/<2-char-shard>/<64-char-hash>/`.
- **Builds run hermetically** in Linux namespace sandboxes (user, mount, PID, IPC, UTS, network namespaces). The sandbox chroots into an isolated filesystem — no access to `/nix`, `/usr`, `/home`, etc. Only `/dev` and `/proc` are bind-mounted from the host.
- **Dependencies** are bind-mounted read-only at `/<shard>/<hash>/` (canonical path), with `/store/<shard>/<hash>/` and `/deps/<name>/` as symlink aliases into that topology.
- **Store-relative relocation** (`runtime_deps`) patches ELF RUNPATH with `$ORIGIN`-relative paths into the store and injects the AT_EXECFN bootstrap for executable ELFs, so dynamically-linked binaries find their shared libraries without copying and work when invoked from both the host store and the sandbox. This is the primary mechanism for runtime dependency resolution.

### Recipe Structure

Each package has two files in `recipes/native/<package>/`:

```
<package>-source.ts   # Downloads the source tarball
<package>.ts          # Builds it
```

Source files use the `download()` SDK function. Build files use `shellBuild()`. Both call `importToStore()` at the end.

### The Toolchain

`recipes/toolchain/native-toolchain.ts` bundles gcc, binutils, glibc (as a sysroot), bash, coreutils, make, tar, sed, grep, gawk, patch, pkgconf, and busybox into a single dependency. Downstream packages depend on this as `dep("toolchain", nativeToolchainRecipe)`.

### Runtime Dependencies and Shared Libraries

When a recipe produces dynamically-linked binaries, it must:
1. Include `runtime_deps: ["toolchain"]` (or additional deps that provide shared libs).
2. Use `$HOD_DUMMY_RPATH` in LDFLAGS (automatically set by `shellBuild`) to reserve ELF space for store-relative RUNPATH patching.
3. After building, `src/relocate.rs` patches RUNPATH with `$ORIGIN`-relative paths and injects the AT_EXECFN bootstrap so the binary works from any CWD on both the host and inside sandboxes.

**Prefer shared libraries** (`--enable-shared`) over static-only builds. This is how NixOS works — shared libs live once in the store and are referenced via RUNPATH. The store-relative relocation system makes this possible without a fixed store root. Use static linking only when shared libs are impractical (e.g., the package has no shared lib support, or you're building a low-level bootstrap dependency).

### Static vs Shared Policy

Use this default policy unless there is a clear reason not to:

- **Libraries should usually be built shared-first.** If a package primarily exists to provide a reusable library (`zlib`, `libffi`, `expat`, `openssl`, `ncurses`, etc.), prefer shared outputs and make sure downstream packages can link against them in the store.
- **Executables should usually dynamically link to shared store libraries.** This reduces duplication and matches how normal distro packages are built.
- **Static-only builds are the exception, not the default.**

This is broadly how `nixpkgs` behaves:
- shared libraries are the normal default,
- static libraries may also be installed when useful,
- fully static builds are usually reserved for bootstrap tooling, rescue binaries, or special package sets.

#### Prefer shared when

- The package is a reusable library consumed by other packages.
- Upstream normally ships `.so` outputs and expects distro-style dynamic linking.
- Multiple downstream packages will depend on it.
- The package supports plugins, modules, or `dlopen()`-style runtime loading.
- You want smaller closures and less duplicated runtime code in the store.

#### Prefer static when

- The package is part of the bootstrap or early toolchain chain.
- The binary is intentionally standalone/self-contained.
- Upstream shared-library support is broken, unusually painful, or clearly not worth the complexity yet.
- The package is only an internal build helper and not a broadly reused runtime dependency.

#### Hod-specific rules for shared libraries

If you build a package with shared libraries:

1. Keep the library `.so` outputs and the development symlinks/metadata needed by downstream builds.
2. Keep `pkg-config` files (`lib/pkgconfig`) and any useful autotools metadata (`share/aclocal`) unless there is a specific reason to remove them.
3. Ensure executables and shared objects have enough dummy RUNPATH space via `$HOD_DUMMY_RPATH`.
4. Include all runtime library providers in `runtime_deps`, not just `toolchain`, when the resulting binaries or shared libraries depend on them at runtime.
5. Prefer fixing the recipe to use store-relative shared linking rather than falling back to static bundling.

#### Current packages by linking policy

This table shows how existing packages map to the policy. Use it as a reference when deciding how to build a new package.

| Package | Category | Shared Libs | Static Libs | Notes |
|---------|----------|:-----------:|:-----------:|-------|
| **Bootstrap / toolchain** (built with `process`, intentionally static) ||||
| bash | bootstrap exec | — | — | Bundled into toolchain |
| binutils | bootstrap exec | — | — | `--disable-shared`; bundled into toolchain |
| coreutils | bootstrap exec | — | — | Bundled into toolchain |
| diffutils | bootstrap exec | — | — | Bundled into toolchain |
| findutils | bootstrap exec | — | — | Bundled into toolchain |
| gawk | bootstrap exec | — | — | Bundled into toolchain |
| grep | bootstrap exec | — | — | Bundled into toolchain |
| make | bootstrap exec | — | — | Bundled into toolchain |
| patch | bootstrap exec | — | — | Bundled into toolchain |
| perl | bootstrap exec | — | — | Minimal perl for OpenSSL Configure |
| pkgconf | bootstrap exec | — | — | Static binary, bundled into toolchain |
| sed | bootstrap exec | — | — | Bundled into toolchain |
| tar | bootstrap exec | — | — | Bundled into toolchain |
| **Libraries** (built with `shellBuild`, shared-first) ||||
| zlib | shared lib | ✓ | ✓ | Core compression library |
| bzip2 | shared lib | ✓ | ✓ | Manual shared-lib build (upstream Makefile has none) |
| xz (liblzma) | shared lib | ✓ | ✓ | Compression library + CLI tools |
| zstd (libzstd) | shared lib | ✓ | ✓ | `LIB_TYPE=dynamic` |
| expat | shared lib | ✓ | ✓ | XML parser library |
| libiconv | shared lib | ✓ | ✓ | Character encoding library |
| libffi | shared lib | ✓ | ✓ | Foreign function interface library |
| ncurses | shared lib | ✓ | — | `--with-shared`; widec + compat symlinks |
| readline | shared lib | ✓ | — | `--disable-static`; links shared ncurses |
| openssl | shared lib | ✓ | ✓ | libcrypto.so + libssl.so; no-module |
| **Executable packages** (built with `shellBuild`, link shared deps) ||||
| curl | exec w/ shared lib | ✓ | — | libcurl.so; links shared openssl, zlib |
| file (libmagic) | exec w/ shared lib | ✓ | — | libmagic.so; links shared zlib, bzip2, xz |
| gzip | exec only | — | — | Links glibc via runtime_deps |
| less | exec only | — | — | Links shared ncurses + glibc |
| m4 | exec only | — | — | Links glibc via runtime_deps |
| cbonsai | exec only | — | — | Links shared ncurses + glibc |
| ca-certificates | data only | — | — | Mozilla CA bundle, no binaries |
| **git** | exec only | — | — | Links shared curl, openssl, zlib, expat, libiconv + glibc |
| **ripgrep** | exec only | — | — | Rust binary; built with `cargoBuild`; links glibc via runtime_deps |
| **fd** | exec only | — | — | Rust binary; built with `cargoBuild` (jemalloc disabled); links glibc via runtime_deps |

**Key takeaways for new packages:**

- If a package provides a reusable library (`.so`), build it shared. Include both shared and static if upstream supports both cleanly.
- If a package is only an executable, link it dynamically against shared deps from the store.
- If a package is part of the bootstrap chain and must be self-contained, static is acceptable — but document why.

---

## 2. Proposing New Packages

### Task

Research and add new package proposals to `NEXT_PACKAGES.md` in priority order.

### Steps

1. **Read `NEXT_PACKAGES.md`** — understand what's already built (checked off) and what's proposed.

2. **Survey the existing recipes** — run `ls recipes/native/` to see what packages exist. Read a few recipe files to understand the current dep graph.

3. **Identify candidate packages** that would be useful. Consider:
   - **Direct utility**: tools the user would run (editors, compression, system tools).
   - **Unblocking future packages**: libraries needed by higher-value packages (e.g., git needs curl + expat + libiconv).
   - **Dependency feasibility**: prefer packages whose dependencies are already built. Research upstream build requirements.

4. **Research each candidate**:
   - Find the latest stable version and download URL.
   - Determine build system (autotools, cmake, make, meson, etc.).
   - Map out dependencies (required and optional).
   - Estimate complexity (trivial/small/medium/large).

5. **Prioritize**: sort by `(feasibility with current deps) × (usefulness)`. Feasibility first — a package whose deps are all built and that uses autotools is easier than one requiring new build tools.

6. **Write proposals** in `NEXT_PACKAGES.md` using this format:

```markdown
- [ ] N. **package-name** — One-line description. Key deps: X, Y (all built / missing: Z). Brief build notes.
```

For packages with missing deps, either:
- Insert the missing dep(s) as separate entries before the package that needs them, OR
- Note the missing dep inline and add it as a separate entry in the right place.

7. **Do not** reference the "Explicitly skipped" section or add items that require Rust/Go toolchains, container runtimes, or kernel-level tools.

---

## 3. Building a Package

### Task

Pick the next unchecked item in `NEXT_PACKAGES.md`, implement the recipe, build it, verify it, and check it off.

### Step-by-Step

#### 3.1 Research

1. **Find the latest stable version** and download URL. Check the project's releases page or official download site.
2. **Download the tarball** and compute its BLAKE3 hash:
   ```bash
   cd /tmp && curl -L -o <package>-<version>.tar.gz "<url>"
   nix run nixpkgs#b3sum -- <package>-<version>.tar.gz
   ```
3. **Determine the build system** — look at the tarball contents for `configure`, `CMakeLists.txt`, `Makefile`, `meson.build`, etc.
4. **Check dependencies** — read `README`, `INSTALL`, or the project's docs. Identify which deps are already built (check `recipes/native/`) and which are missing.

#### 3.2 Handle Missing Dependencies

If the package needs a dependency that isn't built yet:
- If it's a small, easy package, **build the missing dep first** (recursively follow this guide).
- If it's complex or would require significant new infrastructure, **stop and ask the user** rather than going down a deep rabbit hole.
- Insert the new dependency in `NEXT_PACKAGES.md` before the package that needs it.

#### 3.3 Create the Source Recipe

Create `recipes/native/<package>/<package>-source.ts`:

```typescript
//! <package> source download.
//!
//! <Full name> <version> — <one-line description>.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "<download-url>",
  hash: "<blake3-hex-hash>",
});

await importToStore(recipe);
export const <package>SourceRecipe = recipe;
```

#### 3.4 Create the Build Recipe

Create `recipes/native/<package>/<package>.ts`. Use an existing recipe as a template — pick one closest to your package's build system and dependency structure.

**For autotools packages** (most common), use this pattern:

```typescript
//! <package> native build recipe — <description>.
//!
//! Builds <package> <version>. Dependencies: <list>.
//! <Notes about build approach.>

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { <package>SourceRecipe } from "./<package>-source.js";
// Import any additional dep recipes as needed

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/<package>-<version>

# CC, AR, RANLIB, STRIP, CFLAGS, PATH are auto-injected by shellBuild.
# For deps with .pc files, use PKG_CONFIG_PATH (no manual -I/-L needed):
# export PKG_CONFIG_PATH="/deps/zlib/lib/pkgconfig"
export LDFLAGS="$HOD_DUMMY_RPATH"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-dependency-tracking \\
  --disable-nls

make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config files relocatable via pcfiledir (pkgconf extension).
for pc in $OUT/lib/pkgconfig/*.pc $OUT/lib64/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */lib64/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../../..|' "$pc" ;;
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Strip binaries
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# Clean up — remove docs, man pages, info, la files. Keep pkgconfig/aclocal for downstream deps.
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", <package>SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    // Add additional deps here
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const <package>Recipe = recipe;
```

**For Makefile-based packages** (like zstd, bzip2, git): use `make` directly instead of `./configure`. For packages like git that use `config.mak`, write the config file and include `CC`, `AR`, etc. there (the auto-injected env vars won't be picked up by the Makefile's `CC = cc` default).

#### 3.5 Key Build Recipe Rules

1. **Always use `shellBuild`** with `toolchain: "toolchain"` and include `dep("toolchain", nativeToolchainRecipe)` in deps.

2. **`shellBuild` auto-injects `CC`, `AR`, `RANLIB`, `STRIP`, `CFLAGS`, and `PATH`** pointing at the toolchain. You do not need to set these yourself unless the package's build system ignores environment variables (e.g., git's `config.mak` overrides `CC = cc` — in that case, write the values directly into the config file).

3. **Always include `$HOD_DUMMY_RPATH`** in `LDFLAGS`. This reserves space in the ELF for store-relative RUNPATH patching. The default `LDFLAGS` is set to `$HOD_DUMMY_RPATH` by `shellBuild` — if you override `LDFLAGS`, you must include `$HOD_DUMMY_RPATH` yourself.

4. **Prefer shared libraries**: for reusable libraries, use `--enable-shared` and keep downstream-facing metadata (`.so`, pkg-config, headers). Static-only builds should be justified by bootstrap constraints, intentionally standalone binaries, or broken upstream shared support.

5. **For dependencies that provide pkg-config files**, set `PKG_CONFIG_PATH` to include their `lib/pkgconfig` directories. The library recipes use `pcfiledir` to make `.pc` files relocatable, so `pkg-config` returns the correct paths in both sandbox (`/deps/<name>/`) and store contexts:
   ```bash
   export PKG_CONFIG_PATH="/deps/zlib/lib/pkgconfig:/deps/openssl/lib/pkgconfig"
   ```
   This replaces manual `-I` and `-L` flags for autotools-based packages. For packages with custom build systems that don't use pkg-config, you may still need explicit `CPPFLAGS`/`LDFLAGS`.

6. **For dependencies whose binaries should be found at configure time**, add their `bin/` to `PATH`.

7. **Install to `--prefix=/`** with `DESTDIR=$OUT`.

8. **Strip binaries** using the toolchain's strip. Use `find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} +` to strip all binaries.

9. **Fix absolute symlinks** — some packages create absolute symlinks during `make install`. Replace them with relative ones:
   ```bash
   cd $OUT/bin
   ln -sf <target> <link>
   ```

10. **Clean up** — remove docs, man pages, info pages, `.la` files:
    ```bash
    rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
    # Remove share/ entirely ONLY if it contains nothing useful (no aclocal, no pkgconfig)
    rm -rf $OUT/share 2>/dev/null || true
    ```
    **Keep `lib/pkgconfig`** when building libraries — downstream packages need `.pc` files to discover your package. **Keep `share/aclocal`** if the package installs m4 macros for autotools.
    
    A conservative cleanup:
    ```bash
    rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
    # Then check if share/ has anything useful left before removing
    ```

11. **Make pkg-config files relocatable** when building library packages that produce `.pc` files. The standard install prefix of `/` produces `.pc` files with `prefix=/`, which is wrong in the sandbox (where deps are at `/deps/<name>/`) and in the store. Add this snippet after `make install` and before cleanup:
    ```bash
    # Make pkg-config files relocatable via pcfiledir (pkgconf extension).
    for pc in $OUT/lib/pkgconfig/*.pc $OUT/lib64/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
      [ -f "$pc" ] || continue
      case "$pc" in
        */lib64/pkgconfig/*) sed -i 's|^prefix=.*|prefix=${pcfiledir}/../../..|' "$pc" ;;
        */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=${pcfiledir}/../..|' "$pc" ;;
        */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=${pcfiledir}/../..|' "$pc" ;;
      esac
    done
    ```
    This rewrites `prefix=` in all `.pc` files to use `${pcfiledir}` — a pkgconf extension that resolves to the directory containing the `.pc` file. Wherever the `.pc` file lives, `prefix` points to the output root. The snippet is safe to run even if no `.pc` files exist.

12. **Include `runtime_deps`** for any dep whose shared libraries your package links against at runtime. At minimum `["toolchain"]` for glibc. Add additional dep names if your package links their shared libs. If your package now provides shared libraries that downstream executables will use, preserve the `.so` files, soname symlinks, and pkg-config metadata so future recipes can link against them normally.

13. **Do not** access anything outside the sandbox. No `/usr`, no `/nix`, no host tools. If a build fails because it can't find something, fix the recipe — don't mount host paths.

#### 3.6 Import and Build

```bash
# Set up environment
cd /home/crussell/hod
export PATH="$PWD/target/debug:$PATH"
BUN=/nix/store/vmhlm86h4c9gxzrczqd91hwfz2kkfn25-bun-1.3.11/bin/bun

# Import the source recipe
$BUN run recipes/native/<package>/<package>-source.ts

# Import the build recipe
$BUN run recipes/native/<package>/<package>.ts

# Get the recipe hash
HASH=$($BUN -e "
import { <package>Recipe } from './recipes/native/<package>/<package>.js';
console.log(<package>Recipe.hash);
")

# Build
hod build --hash $HASH
```

#### 3.7 Verify

1. **Check the output**:
   ```bash
   hod ls-output <output-hash-from-build>
   ```
   Verify the expected binaries, libraries, and headers are present.

2. **Run a smoke test** if feasible — import the output and run the binary with a trivial invocation to confirm it works.

3. **Check for problems**:
   - No empty directories from failed installs
   - No absolute symlinks pointing outside the output
   - Binaries are stripped (check file size)
   - Shared libraries have `.so` files (if you built with `--enable-shared`)
   - `.pc` files are present for libraries that downstream packages will consume

#### 3.8 Update the Checklist

Only after a successful build and verification:

```markdown
- [x] N. **package** — ...
```

#### 3.9 When Things Go Wrong

- **Build fails**: Read the error output. Common issues:
  - Missing `-I` or `-L` flags for a dependency → add to `CPPFLAGS`/`LDFLAGS`.
  - Configure script can't find a tool → add to `PATH`.
  - `nproc` not found → toolchain busybox provides it; check `PATH` includes `/deps/toolchain/bin`.
  - Hardcoded `/usr/bin/env` or `/bin/sh` → patch the source or use a wrapper.
  - Test failures → add `--disable-tests` or skip the test phase.

- **Try to self-unblock** using standard approaches:
  - Add missing flags or env vars.
  - Patch config files or source with `sed`.
  - Disable problematic features with configure flags.

- **Stop and ask the user** if:
  - The build requires modifying Hod's internals (build.rs, sandbox.rs, etc.).
  - The build needs to mount anything from the host filesystem.
  - The package requires a build tool not in the toolchain (e.g., cmake, meson, python) and it's not already packaged.
  - You've made several attempts and are stuck.

---

## 7. Reference: Existing Recipes by Build System

Use these as templates when creating new recipes:

| Package | Build System | Key Feature |
|---------|-------------|-------------|
| gzip, xz, file, libiconv, expat | autotools (`./configure`) | Standard pattern |
| curl | autotools + pkg-config | Complex configure flags, multiple deps |
| openssl | Perl Configure | Custom build system, static only |
| ncurses | autotools | Widec compat symlinks |
| zstd | Makefile | `LIB_TYPE=static`, separate lib/programs builds |
| bzip2 | Makefile | No configure, sed-patched Makefile |
| perl | Configure + make | Complex, special env setup |
| ripgrep | cargoBuild | Rust package, source tarball + network fetch |
| hello-rust | cargoBuild | Rust test package, inline code |

---

## 5. Building Rust Packages with `cargoBuild`

For Rust packages, use the `cargoBuild` SDK helper instead of `shellBuild`. This helper handles the complexities of running the Rust toolchain inside the sandbox.

### Basic Pattern

```typescript
import { cargoBuild, dep, importToStore } from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { myPackageSourceRecipe } from "./my-package-source.js";

const recipe = await cargoBuild({
  name: "my-binary",
  toolchain: "toolchain",
  rustToolchain: "rust",
  source: "source",           // dep name for the source tarball
  deps: [
    dep("source", myPackageSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("rust", rustRecipe),
    dep("zlib", zlibRecipe),      // needed by rust-lld/libLLVM
    dep("ca-certs", caCertificatesRecipe),  // HTTPS for cargo
  ],
  env: {
    CARGO_HTTP_CAINFO: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_FILE: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
  },
  unsafe_flags: 0x01,          // network access for cargo fetch
  runtime_deps: ["toolchain"], // Rust binaries need libc at runtime
});

await importToStore(recipe);
export const myPackageRecipe = recipe;
```

### Key Differences from `shellBuild`

1. **Must include `rust` dep** — `dep("rust", rustRecipe)` for the Rust toolchain.
2. **Must include `zlib` dep** — `rust-lld` and `libLLVM` need `libz.so`.
3. **Must include `ca-certs` dep** — cargo needs HTTPS to download from crates.io.
4. **`unsafe_flags: 0x01`** — required for network access (cargo fetches deps).
5. **`source` option** — for real projects, provide a source tarball dep.
6. **Runtime deps: only `toolchain`** — Rust binaries are dynamically linked to glibc but not to the Rust toolchain itself.

### Inline Code (for simple test packages)

For small test programs, you can use `cargoToml` and `mainRs` instead of `source`:

```typescript
const recipe = await cargoBuild({
  name: "hello",
  toolchain: "toolchain",
  rustToolchain: "rust",
  cargoToml: `[package]\nname = "hello"\nversion = "0.1.0"\nedition = "2021"`,
  mainRs: 'fn main() { println!("hello"); }',
  deps: [
    dep("toolchain", nativeToolchainRecipe),
    dep("rust", rustRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: ["toolchain"],
});
```

### How `cargoBuild` Handles the Sandbox

The sandbox mounts dependencies in a **canonical store-shaped topology** so relocated executables can run directly from their dependency aliases:

- canonical paths: `/<shard>/<hash>/...`
- compatibility aliases: `/store/<shard>/<hash>/...`
- human-friendly aliases: `/deps/<name>/ -> ../<shard>/<hash>/`

This means a relocated tool like `/deps/rust/bin/rustc` can still resolve a sibling dependency path like `../../../fa/<hash>/lib/ld-linux-x86-64.so.2`, because walking up from `/deps/rust/bin/` lands at `/`, where the top-level shard directories exist.

The `cargoBuild` helper therefore mainly:

1. Copies crt startup files to `/lib/` for the linker.
2. Configures cargo with the correct sysroot, linker, and library paths.
3. Keeps a small compatibility bridge for older relocated toolchains that may still expect an explicit ld-linux file copy.

### Hermeticity Note

Packages built with `unsafe_flags: 0x01` are **not fully hermetic** — they depend on crates.io availability and version specifiers may drift. For fully reproducible builds, pre-vendor dependencies and build offline (future work).

---

## 6. Quick Reference: File Layout

```
recipes/
  native/
    <package>/
      <package>-source.ts    # download() + importToStore()
      <package>.ts           # shellBuild() + importToStore()
    rust/
      rust-source.ts         # Rust toolchain downloads
      rust.ts                # Rust toolchain build + relocate
      hello-world/           # test recipe
      ripgrep/               # real package (cargoBuild)
  toolchain/
    native-toolchain.ts      # the bundled toolchain dep
  bootstrap/                  # seed/bootstrap (not for package agents)
  cross/                      # cross-compilation (not for package agents)
  stage2/                     # gcc-stage2 (not for package agents)
```

```
src/
  build.rs      # DAG resolution, sandboxing, relocation
  sandbox.rs    # Linux namespace sandbox
  relocate.rs   # store-relative ELF RUNPATH patching + AT_EXECFN bootstrap injection
  packed.rs     # AT_EXECFN bootstrap injection
  recipe.rs     # recipe binary format
  store.rs      # SQLite + filesystem store
```
