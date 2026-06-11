import { shellBuild, dep, importToStore, hermeticPreamble, depSubpath } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { zigSourceRecipe } from "./zig-source.js";

const recipe = await shellBuild({
  shell: depSubpath("toolchain", "bin/busybox"),
  preamble: hermeticPreamble({ shell: "toolchain", glibcLinker: "toolchain" }),
  env: {
    PATH: depSubpath("toolchain", "bin"),
  },
  script: `
mkdir -p $OUT/bin

cp -a /deps/zig-source/zig $OUT/bin/zig
cp -a /deps/zig-source/lib $OUT/lib
cp -a /deps/zig-source/include $OUT/include 2>/dev/null || true

$OUT/bin/zig version

echo "=== Zig toolchain installed ==="
ls -la $OUT/bin/
echo "=== Lib ==="
ls $OUT/lib/ | head -10
echo "=== Zig installation complete ==="
`,
  deps: [
    dep("zig-source", zigSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const zigRecipe = recipe;
