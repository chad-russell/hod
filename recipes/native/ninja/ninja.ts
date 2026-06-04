//! Ninja build recipe — the Ninja build system.
//!
//! Builds Ninja 1.13.2 from source using the Hod C++ compiler.
//!
//! Approach: compile all source files directly (no configure.py --bootstrap).
//! The --bootstrap mode tries to run the compiled ninja to rebuild itself,
//! which requires a working dynamic linker in the sandbox. Instead, we
//! compile all .cc files into a static library and link the final binary.
//!
//! Ninja is a build tool only needed at build time — not a runtime dependency.
//! Other recipes will depend on ninja for Meson-based builds.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ninjaSourceRecipe } from "./ninja-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";
import { pythonRecipe } from "../python/python.js";

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["python"],
  }),
  sourceDir: true,
  script: `
# Generate inline header for browse.py (used by browse.cc)
mkdir -p build
bash src/inline.sh kBrowsePy < src/browse.py > build/browse_py.h

# Compiler flags (from configure.py output, adjusted for hermetic build)
# NINJA_PYTHON is defined as a C string literal for the browse tool.
CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
NINJA_DEFINE='-DNINJA_PYTHON="python3.13"'
CXXFLAGS="-Wall -Wextra -Wno-deprecated -Wno-missing-field-initializers -Wno-unused-parameter -fno-rtti -fno-exceptions -std=c++14 -fvisibility=hidden -pipe -O2 -DNDEBUG -DUSE_PPOLL -DNINJA_HAVE_BROWSE $NINJA_DEFINE -I."

# Library sources (everything except the main entry point)
LIB_SOURCES="src/build.cc src/build_log.cc src/clean.cc src/clparser.cc \
  src/debug_flags.cc src/depfile_parser.cc src/deps_log.cc \
  src/disk_interface.cc src/dyndep.cc src/dyndep_parser.cc \
  src/edit_distance.cc src/elide_middle.cc src/eval_env.cc \
  src/graph.cc src/graphviz.cc src/jobserver.cc src/json.cc \
  src/lexer.cc src/line_printer.cc src/manifest_parser.cc \
  src/metrics.cc src/missing_deps.cc src/parser.cc \
  src/real_command_runner.cc src/state.cc src/status_printer.cc \
  src/string_piece_util.cc src/util.cc src/version.cc \
  src/jobserver-posix.cc src/subprocess-posix.cc \
  src/browse.cc"

for src in $LIB_SOURCES; do
  obj="build/$(basename "$src" .cc).o"
  $CXX $CXXFLAGS -c "$src" -o "$obj"
done

# Create static library from all library objects
/deps/toolchain/bin/ar crs build/libninja.a build/*.o

# Compile main entry point separately (not in the library)
$CXX $CXXFLAGS -c src/ninja.cc -o build/ninja_main.o

# Link the final binary
$CXX $HOD_DUMMY_RPATH -O2 -o ninja build/ninja_main.o -Lbuild -lninja -lpthread

# Install
mkdir -p $OUT/bin
cp ninja $OUT/bin/ninja
${STRIP_BINARIES}

# Verify it runs
./ninja --version
`,
  deps: [
    dep("source", ninjaSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const ninjaRecipe = recipe;
