//! conmon native build recipe — OCI container runtime monitor.
//!
//! Builds conmon 2.2.1, the container monitor used by podman and CRI-O.
//! Conmon double-forks to daemonize, launches the OCI runtime, and
//! provides attach/log/exit-code services.
//!
//! Built without systemd (DISABLE_SYSTEMD=1) for non-systemd environments.
//!
//! Dependencies:
//!   - glib (main loop, data structures)
//!   - libseccomp (seccomp notify support)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { glibRecipe } from "../glib/glib.js";
import { libseccompRecipe } from "../libseccomp/libseccomp.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { conmonSourceRecipe } from "./conmon-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["glib", "libseccomp", "pcre2", "libffi", "zlib"],
    libDeps: ["glib", "libseccomp", "pcre2", "libffi", "zlib"],
    pkgConfigDeps: ["glib", "libseccomp", "pcre2", "libffi", "zlib"],
  }),
  sourceDir: true,
  script: `
make -j$(nproc) bin/conmon DISABLE_SYSTEMD=1

install -d $OUT/bin
install -D bin/conmon $OUT/bin/conmon
`,
  deps: [
    dep("source", conmonSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libseccomp", libseccompRecipe),
    dep("pcre2", pcre2Recipe),
    dep("libffi", libffiRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: ["glib", "libseccomp", "toolchain"],
});

await importToStore(recipe);
export const conmonRecipe = recipe;
