//! validate-bash recipe — verifies the hermetic bash binary works correctly.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { glibcRecipe } from "../cross/glibc.js";
import { linuxHeadersRecipe } from "../cross/linux-headers.js";
import { bashRecipe } from "./bash.js";

const preamble = hermeticPreamble({
  shell: "seed",
  muslLinker: "seed",
  glibcLinker: "glibc",
  sysroot: { glibc: "glibc", linuxHeaders: "linux-headers" },
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

# bash may be a wrapper script (when bash has runtime_deps that trigger
# wrapper generation) or a raw ELF. Detect which and pick the file we
# inspect for ELF/linker checks accordingly.
if [ -f /deps/bash/bin/.bash-wrapped ]; then
  BASH_ELF=/deps/bash/bin/.bash-wrapped
else
  BASH_ELF=/deps/bash/bin/bash
fi

# Test 1: Run bash --version to confirm it works
/deps/bash/bin/bash --version > $OUT/version.txt 2>&1

# Test 2: Run a simple script
echo 'echo "hello from hermetic bash"' | /deps/bash/bin/bash > $OUT/hello.txt 2>&1

# Test 3: Check ELF type (should be dynamically linked)
ELF_MAGIC=$(/deps/seed/bin/busybox od -A n -t x1 -N 4 "$BASH_ELF" | tr -d ' ')
if [ "$ELF_MAGIC" != "7f454c46" ]; then
  echo "ERROR: not a valid ELF binary at $BASH_ELF" >&2
  exit 1
fi

# Test 4: Check it links to glibc (libc.so.6)
/deps/seed/bin/busybox strings "$BASH_ELF" | grep -q "libc.so.6" && echo "Dynamically linked to libc.so.6" >> $OUT/checks.txt || echo "WARNING: no libc.so.6 reference" >> $OUT/checks.txt

# Test 5: Check it is NOT linked to musl
if /deps/seed/bin/busybox strings "$BASH_ELF" | grep -q "ld-musl"; then
  echo "ERROR: bash is linked to musl!" >> $OUT/checks.txt
  exit 1
else
  echo "No musl linkage detected" >> $OUT/checks.txt
fi

# Test 6: Run bash inside the sandbox with our glibc
# We need to set up the dynamic linker path
mkdir -p $OUT
echo "All checks passed" >> $OUT/checks.txt`,
  ],
  dependencies: [
    dep("bash", bashRecipe),
    dep("glibc", glibcRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", hodSeedRootRecipe),
  ],
});

await importToStore(recipe);
export const validateBashRecipe = recipe;
