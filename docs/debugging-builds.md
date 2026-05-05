# Debugging Builds

When iterating on complex recipes (e.g., gcc), a full `hod build` cycle can take 20+ minutes — most of which is re-extracting source, re-running configure, and re-materializing deps, not the actual failing step. This document describes strategies to short-circuit that cycle.

## Quick Reference

| Strategy | Speed | Effort | Best For |
|----------|-------|--------|----------|
| `hod shell` | Immediate | Subcommand | Interactive recipe development |
| `hod shell` (reuse) | Instant | Same command | Resuming after a failed build step |
| `hod build --keep-failed` + `sudo chroot` | Immediate | Manual setup | Inspecting build artifacts |

---

## Strategy 1: `hod shell` (Recommended)

`hod shell` drops you into an interactive bash shell inside a fully set up build sandbox. It resolves all dependencies (cached — instant), materializes them, exports recipe env vars, and gives you a bash prompt.

### Basic Usage

```bash
# Drop into the build environment for a recipe
hod shell recipes/gcc/03-gcc.hod
```

### What's Inside

The sandbox contains:

```
shell-XXXXXXXX/
├── bin/            # Seed tool symlinks (bash, gcc, make, etc.)
├── deps/           # All dependency outputs (copied, not bind-mounted)
│   ├── seed/       # Bootstrap toolchain
│   ├── glibc/      # Built glibc
│   ├── gmp/        # Built gmp
│   ├── setup-standard-wrappers/  # Shared wrapper scripts (File dep)
│   │   └── data    # The actual script file
│   ├── build-script/             # Package build script (File dep)
│   │   └── data    # The actual script file
│   └── ...
├── lib/            # Symlinks → /deps/<name>/lib/<lib>
├── lib64/          # Same layout as lib/
├── out/            # $OUT directory (empty, for install output)
├── dev/            # Bind-mounted from host
├── proc/           # Fresh procfs (PID namespace, pid_max=4M)
└── tmp/            # Writable tmpfs
```

### Scripts as Dependencies

Process recipes in the hermetic toolchain use **File dependencies** for their build scripts instead of inline `args[1]` strings. This means the scripts are available as files inside the sandbox:

```bash
# Read the build script to understand what it does
cat /deps/build-script/data

# Read the wrapper setup script
cat /deps/setup-standard-wrappers/data

# Source the wrappers, then run the build
source /deps/setup-standard-wrappers/data
source /deps/setup-gcc-wrappers/data
bash /deps/build-script/data
```

This is much better than the old approach where the entire build script was a ~9KB inline string. See [Recipe Structure](#recipe-structure) below for details.

### Sandbox Reuse (Resumable Sessions)

The sandbox is **preserved after exit** and **reused on re-entry**. This means you can iterate across multiple sessions:

```bash
# First session — sets up sandbox, materializes deps
hod shell recipes/gcc/03-gcc.hod

# Inside: run the build (takes 15+ minutes for gcc)
bash-5.2$ bash /deps/build-script/data
# ... fails during make ...

# Exit the shell (sandbox is preserved on disk)
bash-5.2$ exit

# Re-enter — SAME sandbox, build state intact
hod shell recipes/gcc/03-gcc.hod
# [hod] reusing existing sandbox at ~/.local/share/hod/tmp/shell-49996c7f...

# Pick up where you left off
bash-5.2$ cd /gcc-13.2.0/build
bash-5.2$ make -j2           # resumes from the failure point
```

The sandbox is keyed by recipe hash, so the same recipe file always maps to the same sandbox directory. Build failures do **not** kick you out — the shell survives because the build script's error trap doesn't hard-`exit`.

To start fresh (e.g., after fixing the recipe):

```bash
hod shell recipes/gcc/03-gcc.hod --clean
```

### Environment Variables

All recipe env vars are automatically exported inside the shell:

```
PATH=/tmp/wrappers:/deps/seed/bin
CC=/deps/seed/bin/gcc
CXX=/deps/seed/bin/g++
AR=/deps/seed/bin/ar
RANLIB=/deps/seed/bin/ranlib
CPATH=/deps/glibc/include:...
LDFLAGS=-L/deps/glibc/lib -Wl,-dynamic-linker=/lib/ld-linux-x86-64.so.2
LIBRARY_PATH=/deps/glibc/lib:...
OUT=/out
DEPS=/deps
```

### PID Limits

The sandbox mounts a fresh procfs with `pid_max` set to 4,194,303 (up from the default 32,768). This prevents `vfork: Resource temporarily unavailable` errors during heavy parallel builds (`make -j4`). The RLIMIT_NPROC soft limit is also raised to the hard limit.

---

## Strategy 2: `hod build --keep-failed` + `sudo chroot` (Legacy)

For inspecting failed builds when `hod shell` isn't available. The sandbox is preserved but you lose the namespace setup (no mounts, no env vars).

```bash
# 1. Build with sandbox preserved on failure
hod build recipes/gcc/03-gcc.hod --keep-failed

# 2. Find the sandbox
SANDBOX=$(ls -td ~/.local/share/hod/tmp/sandbox-* | head -1)

# 3. Enter it (you'll need to set up env vars manually)
sudo chroot "$SANDBOX" /bin/bash
```

See `scripts/debug-sandbox.sh` for a convenience script that automates env var setup.

---

## Recipe Structure

### Old Style (inline script)

The original recipes embed the entire build script in `args[1]`:

```json
{
  "type": "process",
  "command": "/bin/bash",
  "args": ["-c", "#!/bin/bash\nset -eo pipefail\n...338 lines of bash..."],
  "dependencies": [...]
}
```

Problems: not editable with syntax highlighting, not reusable, not available in `hod shell`.

### New Style (scripts as File deps)

Build scripts are separate `.sh` files imported as File recipe dependencies:

```
recipes/
  wrappers/
    setup-standard-wrappers.sh    # ls + nproc wrappers (shared by all recipes)
    setup-standard-wrappers.json  # File recipe
    setup-standard-wrappers.hod   # Encoded binary
    setup-gcc-wrappers.sh         # Extended wrappers (gcc only)
    setup-gcc-wrappers.json/.hod
  gcc/
    build-gcc.sh                  # Package-specific build script
    build-gcc.json/.hod           # File recipe for the script
    03-gcc.json                   # Process recipe (thin orchestrator)
    03-gcc.hod                    # Encoded binary
```

The Process recipe becomes a thin orchestrator:

```json
{
  "type": "process",
  "command": "/bin/bash",
  "args": ["/deps/build-script/data"],
  "dependencies": [
    {"name": "build-script", "recipe_hash": "..."},
    {"name": "setup-standard-wrappers", "recipe_hash": "..."},
    {"name": "setup-gcc-wrappers", "recipe_hash": "..."},
    ... source/toolchain deps ...
  ]
}
```

The build script sources the wrappers and runs the build:

```bash
#!/bin/bash
set -eo pipefail
source /deps/setup-standard-wrappers/data
source /deps/setup-gcc-wrappers/data
tar xf /deps/gcc-source/data
cd gcc-13.2.0
# ... configure, make, install ...
```

### Creating Script Dependencies

Use `hod import-file` to create a File recipe from a script:

```bash
# Import a script and write .json + .hod alongside it
hod import-file --executable -o recipes/gcc/build-gcc.sh
# Output: d575b85eb500a5850f4ab1806fa0ddd57f5380605c544c03b37cf4cf55a3ece3
#         wrote recipes/gcc/build-gcc.json and recipes/gcc/build-gcc.hod

# Use the printed hash as a dependency in the Process recipe JSON
```

### Shared Wrapper Scripts

Two levels of wrapper scripts live in `recipes/wrappers/`:

| Script | Contents | Used By |
|--------|----------|---------|
| `setup-standard-wrappers.sh` | `ls` (python), `nproc` | binutils, glibc, gmp, mpfr, mpc, gcc |
| `setup-gcc-wrappers.sh` | `env`, `cc`, `c++`, `cmp`, `diff`, `file`, `egrep`, `fgrep`, `uniq`, `rmdir`, `makeinfo`, `date`, `/usr` symlinks | gcc only |

Each recipe's build script sources only what it needs. The wrapper scripts create executables in `/tmp/wrappers/` which is on `PATH`.

---

## Appendix: Why Full Builds Are Slow for gcc

A typical `hod build recipes/gcc/03-gcc.hod` cycle:

| Phase | Time | Repeatable? |
|-------|------|-------------|
| Dependency resolution (all cached) | ~1s | Yes — always cached |
| Materialize deps into sandbox | ~30s | Repeated every build |
| Recipe script: wrapper scripts | ~1s | Repeated every build |
| Recipe script: extract gcc source | ~30s | Repeated every build |
| Recipe script: create sysroot | ~10s | Repeated every build |
| Recipe script: `../configure` | ~3-5 min | Repeated every build |
| Recipe script: `make -j2` | ~10-15 min | Runs until failure |

The `hod shell` reuse strategy eliminates all of this — you start at the point of failure and can re-run `make` in seconds.

## Appendix: CLI Reference

### `hod shell`

```
hod shell [OPTIONS] <RECIPE_FILE>

Arguments:
  <RECIPE_FILE>  Path to the `.hod` recipe file

Options:
      --store <STORE>  Override store location
      --clean          Start fresh (remove existing sandbox for this recipe)
  -v, --verbose        Print detailed DAG resolution info
```

- Only works with Process recipes.
- Sandbox is always preserved (no `--keep-failed` needed).
- Sandbox is reused on re-entry unless `--clean` is passed.
- Build failures in child processes do not exit the shell.

### `hod import-file`

```
hod import-file [OPTIONS] <FILE>

Arguments:
  <FILE>  Path to the file to import

Options:
      --store <STORE>  Override store location
      --executable     Mark the file as executable
  -o, --output         Also write .json and .hod files next to the source file
```

- Reads the file, stores it as a blob in the store, creates a File recipe.
- Prints the recipe hash (for use as a dependency).
- With `-o`, writes companion `.json` and `.hod` files next to the source.

## Appendix: Finding Sandbox Directories

Shell sandboxes:
```
~/.local/share/hod/tmp/shell-<first-16-chars-of-recipe-hash>/
```

Build sandboxes (from `--keep-failed`):
```
~/.local/share/hod/tmp/sandbox-<first-16-chars-of-recipe-hash>/
```

```bash
# List all sandboxes
ls -ltd ~/.local/share/hod/tmp/shell-* ~/.local/share/hod/tmp/sandbox-*

# Find one with gcc source extracted
ls -td ~/.local/share/hod/tmp/*/gcc-* 2>/dev/null

# Clean up all sandboxes
rm -rf ~/.local/share/hod/tmp/shell-* ~/.local/share/hod/tmp/sandbox-*
```
