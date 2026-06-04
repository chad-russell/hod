# Plan: Standardize Shared Library Stripping in Build Profiles

**Status:** Partially done — helpers created, migration in progress  
**Current authority:** `recipes/helpers/strip.ts` and current package recipes

## What's Done

- `recipes/helpers/strip.ts` created with `STRIP`, `STRIP_BINARIES`, `STRIP_LIBRARIES`, `STRIP_ALL`, and `RELOCATE_PKG_CONFIG`
- `recipes/helpers/net.ts` created with `caCertEnv()` and `depEnvFromList()`
- `recipes/helpers/c.ts` — `cProfile()` now has `cxx?: boolean` option for C++ builds
- `recipes/helpers/meson.ts` — inherits `cxx` option via `CProfileOptions`
- 103 recipes migrated from inline pkg-config loop to `RELOCATE_PKG_CONFIG`
- ~43 recipes already use `STRIP_ALL`
- `cargoBuild()` and `goBuild()` auto-strip their outputs

## What Remains

### Strip migration (~60 recipes with inline strip)

These still use inline `/deps/toolchain/bin/strip` instead of `STRIP_ALL`:
```
bash, coreutils, diffutils, findutils, gawk, grep, sed, tar, make, patch,
bzip2, lz4, xz, zstd, curl, expat, file, git, gmp, gperf, gzip, hello-x11,
hod-heartbeat, htop, jq, less, libdrm, libevent, libffi, libglvnd, libiconv,
libjpeg, libpng, libsncfile, lua, nano, ncdu, ncurses, ninja, nodejs, openssh,
openssl, patchelf, pcre2, perl, pipewire, pixman, pkgconf, procps-ng,
pulseaudio, pv, python, readline, shared-mime-info, sqlite, strace, tig,
tmux, tree, unzip, vim, wget, wl-clipboard, xcb-util, xcb-util-cursor,
xcb-util-image, xcb-util-renderutil, xxhash, zlib, age, github-cli, restic
```

Migrate when touching these recipes for other reasons, or in a bulk pass.

### CA cert env migration (~30 recipes)

Replace manual `CARGO_HTTP_CAINFO`/`SSL_CERT_FILE` with `caCertEnv()` from `net.ts`.

### CXX migration (~22 recipes)

Replace `export CXX=...` in scripts with `cxx: true` in `cProfile()` calls.

### Missing strip entirely (3 recipes)

- `bindgen-clang` — installs unstripped `libclang.so*` and `libLLVM.so*`
- `spirv-tools` — installs unstripped `spirv-link`
- `spirv-llvm-translator` — installs unstripped `llvm-spirv`
