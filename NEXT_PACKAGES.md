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

- [ ] **eza** — `eza` 0.23.4 (github.com/eza-community/eza). Modern replacement for `ls` — colored output, git status, tree view, file type icons. Pure Rust. cargoBuild with `source`. `runtime_deps: ["toolchain"]`.

- [ ] **delta** — `delta` 0.19.2 (github.com/dandavison/delta). Syntax-highlighting pager for git, diff, and grep output — side-by-side diffs, line numbers, commit navigation. Rust, uses `git2` crate (vendored libgit2 + openssl). cargoBuild with `source`. Deps: toolchain + zlib + openssl + ca-certificates. `runtime_deps: ["toolchain", "openssl", "zlib"]`.

- [ ] **zellij** — `zellij` 0.42.0 (github.com/zellij-org/zellij). Modern terminal multiplexer — a `tmux` alternative with WASM plugin support, layouts, and floating panes. Pure Rust. cargoBuild with `source`. `runtime_deps: ["toolchain"]`.

- [ ] **starship** — `starship` 1.23.0 (github.com/starship/starship). Minimal, blazing-fast shell prompt — shows git status, language version, command duration, etc. Rust, uses `git2` crate. cargoBuild with `source`. Deps: toolchain + zlib + openssl + ca-certificates. `runtime_deps: ["toolchain", "openssl", "zlib"]`.

- [ ] **lazygit** — `lazygit` 0.51.0 (github.com/jesseduffield/lazygit). Simple terminal UI for git — staging, committing, branching, diffing, and log browsing. Go, goBuild with `source`. Deps: toolchain + go + ca-certificates. `runtime_deps: ["toolchain"]`.

- [ ] **gdu** — `gdu` 5.30.1 (github.com/dundee/gdu). Fast disk usage analyzer — written in Go with parallel traversal. Go, goBuild with `source`. Deps: toolchain + go + ca-certificates. `runtime_deps: ["toolchain"]`.

- [ ] **gdb** — `gdb` 16.2 (ftp.gnu.org/gnu/gdb). GNU Debugger — essential C/C++/Rust debugging tool. C/autotools build. Deps: toolchain + ncurses + readline + python (all built). `shellBuild` with autotools. `runtime_deps: ["toolchain", "ncurses", "readline", "python"]`.

- [ ] **chafa** — `chafa` 1.16.0 (github.com/hpjansson/chafa). Image-to-text converter — renders images in the terminal using Unicode/ASCII art. C/autotools build. Deps: toolchain only (optional: librsvg, cairo — can be disabled). `shellBuild` with autotools. `runtime_deps: ["toolchain"]`.

- [ ] **cmake** — `cmake` 4.0.3 (github.com/Kitware/CMake). Cross-platform build system generator — essential for building many C/C++ projects. C++ bootstrap build (`./bootstrap && make`). Deps: toolchain only. `shellBuild`. `runtime_deps: ["toolchain"]`.
