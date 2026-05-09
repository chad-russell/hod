# Next Packages

Goal: **Build the most-wanted developer tools** — the kind of thing people reach for on a new machine via `brew install` or `pacman -S`.

Already built: ripgrep, jq, curl, git, vim, tmux, htop, tree, strace, less, file, findutils, grep, gzip, xz, zstd, bzip2, python, sqlite, openssh, rsync, procps-ng, nano, openssl, ncurses, readline, zlib, ca-certificates, fd, bat, just, tokei, hyperfine, zoxide, tealdeer, dust, ncdu, nnn, cbonsai, bc, m4, autoconf, automake, bison, flex, libxml2, pcre2, libevent, lz4, perl, and the full native toolchain + Rust toolchain.

---

## Next 10 — popular developer tools

Six Rust packages (using `cargoBuild`) and four C packages (using `shellBuild`). All dependencies are already built. Ordered by popularity × feasibility.


- [ ] 1. **eza** — `eza` 0.23.4 (github.com/eza-community/eza). Modern, maintained replacement for `ls` — colors, Git status, icons, tree view. Extremely popular on homebrew/arch/nixpkgs. Pure Rust with bundled `git2` (compiles libgit2 from source via cc). cargoBuild with `source`. `runtime_deps: ["toolchain"]`.

- [ ] 2. **delta** — `delta` 0.19.2 (github.com/dandavison/delta). Syntax-highlighting pager for git, diff, and grep output. Very popular among developers as a diff viewer. Pure Rust with bundled `git2`. cargoBuild with `source`. `runtime_deps: ["toolchain"]`.

- [ ] 3. **bottom** — `bottom` 0.12.3 (github.com/ClementTsang/bottom). Cross-platform system and process monitor (`btm`) — a modern `htop` alternative with customizable TUI. Very popular. Pure Rust. cargoBuild with `source`. `runtime_deps: ["toolchain"]`.

- [ ] 4. **procs** — `procs` 0.14.11 (github.com/dalance/procs). Modern replacement for `ps` — colored output, tree view, Docker/container awareness. Pure Rust. cargoBuild with `source`. `runtime_deps: ["toolchain"]`.

- [ ] 5. **wget** — `wget` 1.25.0 (ftp.gnu.org/gnu/wget). GNU file downloader — the classic `wget` for HTTP/HTTPS/FTP. Essential CLI tool, complementary to curl. C/autotools build. Deps: toolchain + openssl + zlib (all built). `shellBuild` with autotools. `runtime_deps: ["openssl", "zlib", "toolchain"]`.

- [ ] 6. **tig** — `tig` 2.6.0 (github.com/jonas/tig). ncurses-based text-mode interface for git — repository browser, blame viewer, staging helper. Very popular Git companion. C/autotools build. Deps: toolchain + ncurses + readline (all built). Bundles its own utf8proc. `shellBuild` with autotools. `runtime_deps: ["ncurses", "readline", "toolchain"]`.

- [x] 7. **pv** — `pv` 1.10.5 (ivarch.com/programs/pv). Pipe Viewer — monitor data progress through pipes with ETA, speed, and progress bars. Incredibly useful for large file operations and backups. C/autotools build. Deps: toolchain only. `shellBuild` with autotools. `runtime_deps: ["toolchain"]`.

- [ ] 8. **hexyl** — `hexyl` 0.17.0 (github.com/sharkdp/hexyl). Command-line hex viewer with colored output. From the sharkdp family (fd, bat, hyperfine). Pure Rust. cargoBuild with `source`. `runtime_deps: ["toolchain"]`.

- [ ] 9. **sd** — `sd` 1.1.0 (github.com/chmln/sd). Intuitive find & replace CLI — a modern `sed` alternative with regex support and streaming mode. Pure Rust. cargoBuild with `source`. `runtime_deps: ["toolchain"]`.

- [ ] 10. **xxhash** — `xxhash` 0.8.3 (github.com/Cyan4973/xxHash). Extremely fast non-cryptographic hash algorithm (XXH3, XXH64, XXH32). Provides `xxhsum` CLI and `libxxhash.so`. Widely used as a library dependency and standalone checksum tool. C/Makefile build. Deps: toolchain only. `shellBuild` with make (`LIB_TYPE=dynamic`). `runtime_deps: ["toolchain"]`.
