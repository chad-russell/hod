//! Bun-backed npm package helper.
//!
//! This helper installs a pinned npm package into a Hod output using Bun and
//! creates stable wrapper scripts for the package executables. It is a pragmatic
//! bridge for migrating ThinkPad dev tools while Hod grows a more hermetic npm
//! packaging story.

import { dep, importToStore, shellBuild } from "../../js/src/index.js";
import type { BuiltRecipe } from "../../js/src/file.js";
import { bunRecipe } from "../native/bun/bun.js";
import { caCertificatesRecipe } from "../native/ca-certificates/ca-certificates.js";
import { nativeToolchainRecipe } from "../toolchain/native-toolchain.js";
import { cProfile } from "./c.js";
import { caCertEnv } from "./build-env.js";

export interface BunPackageBin {
  /** Executable name exposed in $OUT/bin. */
  name: string;
  /** Path to execute, relative to the installed package root. */
  target: string;
}

export interface BunPackageOptions {
  /** npm package name. */
  packageName: string;
  /** Exact npm package version. */
  version: string;
  /** Additional exact package refs to install alongside the main package. */
  extraPackageRefs?: string[];
  /** Executables to expose. */
  bins: BunPackageBin[];
}

export async function bunPackage(opts: BunPackageOptions): Promise<BuiltRecipe> {
  if (!opts.packageName || !opts.version || opts.bins.length === 0) {
    throw new Error("bunPackage(): packageName, version, and bins are required");
  }

  const packageRef = `${opts.packageName}@${opts.version}`;
  const packageRefs = [packageRef, ...(opts.extraPackageRefs ?? [])].join(" ");
  const buildBun = "/deps/bun/lib/ld-musl-x86_64.so.1 /deps/bun/bin/.bun-real";
  const wrapperScripts = opts.bins.map((bin) => `
cat > $OUT/bin/${bin.name} <<'EOF'
#!/bin/sh
case "\$0" in
    /*) _self="\$0" ;;
    *)  _self="\$(pwd)/\$0" ;;
esac
prefix="\$(cd "\${_self%/*}/.." && pwd -P)"
export PATH="\$prefix/bin:\$prefix/node_modules/.bin\${PATH:+:\$PATH}"
exec bun "\$prefix/node_modules/${opts.packageName}/${bin.target}" "\$@"
EOF
chmod +x $OUT/bin/${bin.name}
`).join("\n");

  const profile = cProfile({ binDeps: ["bun"] });
  const recipe = await shellBuild({
    ...profile,
    env: { ...profile.env, ...caCertEnv() },
    script: `
mkdir -p /tmp/npm $OUT/bin
cd /tmp/npm

export HOME=/tmp
export BUN_INSTALL_CACHE_DIR=/tmp/bun-cache

# Bun's upstream binary is musl-linked and keeps its loader in the Bun output.
# Bridge it into the build sandbox before executing /deps/bun/bin/bun.
ln -sf /deps/bun/lib/ld-musl-x86_64.so.1 /lib/ld-musl-x86_64.so.1

${buildBun} init -y >/dev/null
${buildBun} add --exact ${packageRefs}

cp -a node_modules package.json bun.lock $OUT/
${wrapperScripts}
`,
    deps: [
      dep("bun", bunRecipe),
      dep("ca-certs", caCertificatesRecipe),
      dep("toolchain", nativeToolchainRecipe),
    ],
    runtime_deps: ["bun"],
    unsafe_flags: 0x01,
  });

  await importToStore(recipe);
  return recipe;
}
