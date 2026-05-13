# Next Packages

Goal: **Build the most-wanted developer tools** — the kind of thing people reach for on a new machine via `brew install` or `pacman -S`.

Already built: ripgrep, jq, curl, git, vim, tmux, htop, tree, strace, less, file, findutils, grep, gzip, xz, zstd, bzip2, python, sqlite, openssh, rsync, procps-ng, nano, openssl, ncurses, readline, zlib, ca-certificates, fd, bat, just, tokei, hyperfine, zoxide, tealdeer, dust, ncdu, nnn, cbonsai, bc, m4, autoconf, automake, bison, flex, libxml2, pcre2, libevent, lz4, perl, procs, wget, tig, hexyl, sd, watchexec, xxhash, patchelf, bottom, and the full native toolchain + Rust toolchain.

---

## Next 10 — popular developer tools

Six Rust packages (using `cargoBuild`) and four C packages (using `shellBuild`). All dependencies are already built. Ordered by popularity × feasibility.


- [x] **procs** — `procs` 0.14.11 (github.com/dalance/procs). Modern replacement for `ps` — colored output, tree view, Docker/container awareness. Pure Rust.

- [x] **wget** — `wget` 1.25.0 (ftp.gnu.org/gnu/wget). GNU file downloader — the classic `wget` for HTTP/HTTPS/FTP. Essential CLI tool, complementary to curl. C/autotools build. Deps: toolchain + openssl + zlib (all built). `shellBuild` with autotools. `runtime_deps: ["openssl", "zlib", "toolchain"]`.

- [x] **tig** — `tig` 2.6.0 (github.com/jonas/tig). ncurses-based text-mode interface for git — repository browser, blame viewer, staging helper. Very popular Git companion. C/autotools build. Deps: toolchain + ncurses + readline (all built). Bundles its own utf8proc. `shellBuild` with autotools. `runtime_deps: ["ncurses", "readline", "toolchain"]`.

- [x] **hexyl** — `hexyl` 0.17.0 (github.com/sharkdp/hexyl). Command-line hex viewer with colored output. From the sharkdp family (fd, bat, hyperfine). Pure Rust. cargoBuild with `source`. `runtime_deps: ["toolchain"]`.

- [x] **sd** — `sd` 1.1.0 (github.com/chmln/sd). Intuitive find & replace CLI — a modern `sed` alternative with regex support and streaming mode. Pure Rust. cargoBuild with `source`. `runtime_deps: ["toolchain"]`.

- [x] **xxhash** — `xxhash` 0.8.3 (github.com/Cyan4973/xxHash). Extremely fast non-cryptographic hash algorithm (XXH3, XXH64, XXH32). Provides `xxhsum` CLI and `libxxhash.so`. Widely used as a library dependency and standalone checksum tool. C/Makefile build. Deps: toolchain only. `shellBuild` with make (`LIB_TYPE=dynamic`). `runtime_deps: ["toolchain"]`.

- [x] **patchelf** — `patchelf` 0.15.0 (github.com/NixOS/patchelf). Utility to modify existing ELF executables — change interpreter, RPATH/RUNPATH, soname. Essential for NixOS-style content-addressed builds. C++/autotools build (requires autoreconf bootstrap). Deps: toolchain + autoconf + automake + m4 + perl. `shellBuild` with autotools. `runtime_deps: ["toolchain"]`.

---

## Next 10 (batch 2) — more developer tools

Five Rust packages (using `cargoBuild`) and five C/Go packages (using `shellBuild` or `goBuild`). All dependencies are already built. Ordered by popularity × feasibility.

- [x] **bottom** — `bottom` 0.12.3 (github.com/ClementTsang/bottom). Cross-platform graphical process/system monitor for the terminal — a modern `htop` alternative with CPU, memory, disk, network, and process widgets. Pure Rust. cargoBuild with `source` (binary name: `btm`). `runtime_deps: ["toolchain"]`.

- [x] **eza** — `eza` 0.23.4 (github.com/eza-community/eza). Modern replacement for `ls` — colored output, git status, tree view, file type icons. Pure Rust. cargoBuild with `source`. `runtime_deps: ["toolchain"]`.

- [x] **zellij** — `zellij` 0.44.3 (github.com/zellij-org/zellij). Modern terminal multiplexer — a `tmux` alternative with WASM plugin support, layouts, and floating panes. Rust with vendored curl/openssl (isahc). cargoBuild with `source`. Deps: toolchain + rust + zlib + ca-certs + perl (for openssl-sys vendored build). `runtime_deps: ["toolchain"]`.

- [x] **lazygit** — `lazygit` 0.51.0 (github.com/jesseduffield/lazygit). Simple terminal UI for git — staging, committing, branching, diffing, and log browsing. Go, goBuild with `source`. Deps: toolchain + go + ca-certificates. `runtime_deps: ["toolchain"]`.

- [x] **gdb** — `gdb` 17.2 (ftp.gnu.org/gnu/gdb). GNU Debugger — essential C/C++/Rust debugging tool with Python scripting, TUI, expat XML, zlib/xz compressed debug. C++/autotools build from binutils-gdb combined source tree. Deps: toolchain + GMP + MPFR + Python + ncurses + readline + expat + zlib + xz (all built). `shellBuild` with autotools (CXX needed for C++17). `runtime_deps: ["toolchain", "gmp", "mpfr", "ncurses", "readline", "python", "expat", "zlib", "xz"]`. Note: Python scripting works inside sandbox; at runtime needs PYTHONHOME set in wrapper (future wrap.rs enhancement).
