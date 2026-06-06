import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { basuSourceRecipe } from "./basu-source.js";
import { gperfRecipe } from "../gperf/gperf.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["gperf"],
  }),
  sourceDir: true,
  script: `
cat > /usr/bin/getent << 'GETENT'
#!/bin/sh
if [ "$1" = "passwd" ] && [ "$2" = "65534" ]; then
  echo "nobody:x:65534:65534:Nobody:/nonexistent:/usr/sbin/nologin"
  exit 0
fi
exit 1
GETENT
chmod +x /usr/bin/getent

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dlibcap=disabled \\
  -Daudit=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", basuSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("gperf", gperfRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const basuRecipe = recipe;
