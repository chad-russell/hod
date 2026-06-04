//! crun native build recipe — fast OCI container runtime.
//!
//! Builds crun 1.28 with seccomp and capability support. Configured without
//! systemd, CRIU, and BPF for a minimal non-systemd environment.
//!
//! Dependencies:
//!   - libcap (POSIX.1e capabilities)
//!   - libseccomp (syscall filtering)
//!   - json-c (JSON parsing, replaces yajl in crun 1.28)
//!   - toolchain (gcc, glibc, etc.)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libcapRecipe } from "../libcap/libcap.js";
import { libseccompRecipe } from "../libseccomp/libseccomp.js";
import { jsonCRecipe } from "../json-c/json-c.js";
import { pythonRecipe } from "../python/python.js";
import { crunSourceRecipe } from "./crun-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libcap", "libseccomp", "json-c"],
    libDeps: ["libcap", "libseccomp", "json-c"],
    pkgConfigDeps: ["libcap", "libseccomp", "json-c"],
    python: "python",
  }),
  sourceDir: true,
  script: `
export LDFLAGS="$HOD_DUMMY_RPATH $LDFLAGS"

if [ ! -f ./configure ]; then
  ./autogen.sh
fi

# Patch out self-cloning (memfd re-exec). crun clones itself into a memfd
# and re-execs, which breaks packed binary AT_EXECFN resolution. We trust
# our store's integrity guarantees instead.
sed -i 's/int ensure_cloned_binary(void)/int ensure_cloned_binary(void){ return 0; } int _disabled_ensure_cloned_binary(void)/' src/libcrun/cloned_binary.c

./configure \\
  --prefix=/ \\
  --disable-systemd \\
  --disable-criu

make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_ALL}
rm -rf $OUT/share/man $OUT/lib 2>/dev/null || true
`,
  deps: [
    dep("source", crunSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libcap", libcapRecipe),
    dep("libseccomp", libseccompRecipe),
    dep("json-c", jsonCRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: ["json-c", "libcap", "libseccomp", "toolchain"],
});

await importToStore(recipe);
export const crunRecipe = recipe;
