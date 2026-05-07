# Next Packages

Already built: bash, binutils, coreutils, diffutils, findutils, gawk, grep, make, patch, sed, tar, cbonsai, ncurses, zlib, openssl, bzip2, xz, readline, libffi, pkgconf, perl, curl, ca-certificates, gzip, less, m4, expat, file, zstd, libiconv, git, openssh, vim, procps-ng, htop, strace, nano, rsync, jq, oniguruma, tree, python.

Prioritized by (feasibility with current deps) × (usefulness to you).

## Batch 3: Build infrastructure + enabler libraries + high-value tool

This batch focuses on (a) completing the autotools stack so we can self-host builds that need `autoreconf`, (b) adding small widely-needed libraries that unblock many downstream packages, and (c) a high-value everyday tool to round it out.

- [ ] 1. **autoconf** — GNU Autoconf 2.72. Generates `configure` scripts. Needs m4 + perl (both built). It's a Perl/shell script package (no compilation). Essential infrastructure: many source tarballs ship without a pre-generated `configure` and need `autoreconf` to build. Trivial build; unlocks a huge class of packages.
- [ ] 2. **automake** — GNU Automake 1.18.1. Generates `Makefile.in` from `Makefile.am`. Needs autoconf + perl. Paired with autoconf to complete the autotools generation toolchain. Also a Perl script package; trivial once autoconf is done.
- [ ] 3. **bison** — GNU Bison 3.8.2. Parser generator (LALR/YACC replacement). Needs m4 (built). Standard autotools build. Unblocks many packages whose build requires bison (e.g., flex's own build, many language runtimes, databases).
- [ ] 4. **flex** — Flex 2.6.4. Fast lexical analyzer generator (LEX replacement). Needs m4 (built); bison optional but we'll have it. Standard autotools build with `--disable-bootstrap` for cross-build friendliness. Paired with bison as the standard parser/lexer toolchain.
- [ ] 5. **sqlite** — SQLite 3.53.1. Self-contained SQL database engine (amalgamation build with autoconf tarball). Zero external deps beyond toolchain. Produces `libsqlite3.so`, `sqlite3` CLI, headers, and pkg-config. Enables Python `_sqlite3` extension module and is used by countless other packages.
- [ ] 6. **lz4** — LZ4 1.10.0. Extremely fast compression library. Standalone, zero deps beyond toolchain. Simple Makefile build (`make install`). Produces `liblz4.so`, `lz4` CLI. Needed by libarchive, cURL (HTTP content-encoding), and many modern packages.
- [ ] 7. **pcre2** — PCRE2 10.47. Perl-compatible regular expression library. Standalone autotools build, zero deps beyond toolchain (optionally uses zlib, bzip2 for JIT). Produces `libpcre2-8.so` and `pcre2grep` CLI. Required by git (can replace bundled copy), grep, less, and many other tools that use regex.
- [ ] 8. **libevent** — libevent 2.1.12-stable. Event notification library. Needs openssl (optional, for bufferevent OpenSSL support — already built). Autotools build. Produces `libevent.so`, `libevent_openssl.so`. Enables tmux, tor, memcached, and many network services.
- [ ] 9. **libxml2** — libxml2 2.13.8. XML C parser and toolkit. Needs zlib, xz, libiconv (all built); optionally readline, ncurses. CMake or autotools build. Produces `libxml2.so`, headers, pkg-config. Ubiquitous dependency (curl HTTP/2 via nghttp2 needs it, desktop stack, Python lxml, etc.).
- [ ] 10. **tmux** — tmux 3.6a. Terminal multiplexer. Needs libevent + ncurses (both will be built). Standard autotools build. High everyday value for development workflow. Produces a single `bin/tmux` binary dynamically linked to libevent, ncurses, and glibc via store-relative RPATH.
