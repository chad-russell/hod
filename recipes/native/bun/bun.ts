//! Bun — upstream release binary packaged for Hod.
//!
//! This recipe intentionally uses Bun's content-hashed upstream binary release
//! instead of building from source. The output is made Hod-store self-contained
//! by relocating the upstream musl binary to the Hod-built musl runtime.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { hodMuslToolchainRecipe } from "../../bootstrap/hod-musl-toolchain.js";
import { unzipRecipe } from "../unzip/unzip.js";
import { patchelfRecipe } from "../patchelf/patchelf.js";
import { bunSourceRecipe } from "./bun-source.js";
import { bunMuslRuntimeRecipe } from "./bun-musl-runtime.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({ binDeps: ["unzip", "patchelf"] }),
  script: `
mkdir -p /tmp/bun $OUT/bin
cp /deps/source/source /tmp/bun/bun.zip
unzip -q /tmp/bun/bun.zip -d /tmp/bun/extract

cp /tmp/bun/extract/bun-linux-x64-musl-baseline/bun $OUT/bin/.bun-real
chmod +x $OUT/bin/.bun-real

# The upstream musl binary has no RUNPATH slot Hod can patch for libstdc++ and
# libgcc_s, so keep those runtime libraries local to Bun's output. Bun also
# shells out to basic POSIX tools for some commands (for example, bun init uses
# install), so include BusyBox applets in a private PATH.
mkdir -p $OUT/lib $OUT/libexec/hod-bin
cp -a /deps/musl/x86_64-linux-musl-native/lib/libc.so $OUT/lib/
ln -sf libc.so $OUT/lib/ld-musl-x86_64.so.1
ln -sf libc.so $OUT/lib/libc.musl-x86_64.so.1
cp -a /deps/musl/x86_64-linux-musl-native/lib/libstdc++.so* $OUT/lib/
cp -a /deps/musl/x86_64-linux-musl-native/lib/libgcc_s.so* $OUT/lib/
/deps/patchelf/bin/patchelf \
  --set-rpath '\$ORIGIN/../lib' \
  $OUT/bin/.bun-real
cp -a /deps/toolchain/bin/busybox $OUT/libexec/hod-bin/busybox
for applet in $(/deps/toolchain/bin/busybox --list); do
  [ "$applet" = "busybox" ] && continue
  ln -sf busybox "$OUT/libexec/hod-bin/$applet" 2>/dev/null || true
done

cat > $OUT/bin/bun <<'EOF'
#!/bin/sh
case "\$0" in
    /*) _self="\$0" ;;
    *)  _self="\$(pwd)/\$0" ;;
esac
bin_dir="\${_self%/*}"
prefix="\$(cd "\$bin_dir/.." && pwd -P)"

export PATH="\$prefix/libexec/hod-bin\${PATH:+:\$PATH}"

exec "\$bin_dir/.bun-real" "\$@"
EOF
chmod +x $OUT/bin/bun
`,
  deps: [
    dep("source", bunSourceRecipe),
    dep("runtime", bunMuslRuntimeRecipe),
    dep("musl", hodMuslToolchainRecipe),
    dep("patchelf", patchelfRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("unzip", unzipRecipe),
  ],
  runtime_deps: ["runtime"],
});

await importToStore(recipe);
export const bunRecipe = recipe;
