//! podman native build recipe — OCI container engine.
//!
//! Builds podman 5.8.2 with minimal build tags for a non-systemd environment.
//! Uses CGo (only external dep: libseccomp) and the pure-Go sqlite backend
//! to avoid libsqlite3. Source tarball includes vendor/ — no network needed.
//!
//! Build tags:
//!   seccomp                    — syscall filtering (mandatory, needs libseccomp)
//!   containers_image_openpgp   — pure-Go OpenPGP (avoids libgpgme CGo dep)
//!   exclude_graphdriver_btrfs  — no btrfs support (avoids libbtrfs)
//!   grpcnotrace                — avoid grpc tracing overhead
//!   ossqlite                   — pure-Go sqlite (avoids libsqlite3 CGo dep)
//!
//! Notably EXCLUDED:
//!   systemd     — no journald, no systemd unit integration
//!   apparmor    — no AppArmor confinement
//!   libsubid    — podman reads /etc/subuid & /etc/subgid directly
//!
//! The _installPrefix and _etcDir LDFLAGS are set to /usr so podman's
//! compiled-in defaults point at standard paths. The containers.conf
//! config bundle overrides all helper binary paths at runtime.
//!
//! Dependencies:
//!   - libseccomp (syscall filtering — mandatory CGo dep)
//!   - go (Go 1.26.3 toolchain)
//!   - toolchain (gcc, glibc, etc.)

import {
  shellBuild,
  dep,
  importToStore,
  depPath,
  depSubpath,
} from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { goRecipe } from "../go/go.js";
import { libseccompRecipe } from "../libseccomp/libseccomp.js";
import { pkgconfRecipe } from "../pkgconf/pkgconf.js";
import { podmanSourceRecipe } from "./podman-source.js";
import { goProfile } from "../../helpers/go.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const profile = goProfile({ cgo: true });

const recipe = await shellBuild({
  shell: profile.shell,
  preamble: profile.preamble,
  env: {
    ...profile.env,
    PKG_CONFIG_PATH: [
      depSubpath("libseccomp", "lib/pkgconfig"),
    ].join(":"),
    CGO_CFLAGS: [
      profile.env.CGO_CFLAGS,
      `-I${depSubpath("libseccomp", "include")}`,
    ].join(" "),
    CGO_LDFLAGS: [
      profile.env.CGO_LDFLAGS,
      `-L${depSubpath("libseccomp", "lib")}`,
    ].join(" "),
    LD_LIBRARY_PATH: depSubpath("libseccomp", "lib"),
    GOFLAGS: "-trimpath -mod=vendor",
    BUILDTAGS: "grpcnotrace containers_image_openpgp exclude_graphdriver_btrfs seccomp ossqlite",
    PREFIX: "/usr",
    ETCDIR: "/etc",
    HELPER_BINARIES_DIR: "/usr/libexec/podman",
  },
  sourceDir: true,
  script: `
make -j$(nproc) bin/podman bin/rootlessport

install -d $OUT/bin $OUT/libexec/podman
install bin/podman $OUT/bin/podman
install bin/rootlessport $OUT/libexec/podman/rootlessport

${STRIP_BINARIES}
`,
  deps: [
    dep("source", podmanSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("go", goRecipe),
    dep("libseccomp", libseccompRecipe),
    dep("pkgconf", pkgconfRecipe),
  ],
  runtime_deps: ["libseccomp", "toolchain"],
});

await importToStore(recipe);
export const podmanRecipe = recipe;
