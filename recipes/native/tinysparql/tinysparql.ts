//! tinysparql build recipe — SPARQL triple store library (formerly Tracker).
//!
//! Builds TinySPARQL 3.9.2. Provides tracker-sparql-3.0 / tinysparql-3.0
//! for Nautilus file manager.
//!
//! Dependencies: glib, json-glib, libxml2, sqlite, dbus, libsoup3, libunistring.
//!
//! Build challenges and solutions:
//! - cc.run() for sqlite FTS5 check: patched out, hardcoded true (our sqlite has FTS5)
//! - cc.run() for strftime year modifier: patched out, hardcoded '%Y' (glibc supports it)
//! - subdir('po') needs gettext: patched out
//! - subdir('fuzzing') has run_command: patched out
//! - subdir('examples') always builds: patched out

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { tinysparqlSourceRecipe } from "./tinysparql-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { jsonGlibRecipe } from "../json-glib/json-glib.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { xzRecipe } from "../xz/xz.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { sqliteRecipe } from "../sqlite/sqlite.js";
import { dbusRecipe } from "../dbus/dbus.js";
import { expatRecipe } from "../expat/expat.js";
import { libsoup3Recipe } from "../libsoup3/libsoup3.js";
import { nghttp2Recipe } from "../nghttp2/nghttp2.js";
import { libpslRecipe } from "../libpsl/libpsl.js";
import { libidn2Recipe } from "../libidn2/libidn2.js";
import { libunistringRecipe } from "../libunistring/libunistring.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const tinysparqlRuntimeDeps = [
  "dbus", "expat", "glib", "json-glib", "libffi", "libiconv", "libidn2",
  "libpsl", "libsoup3", "libunistring", "libxml2", "nghttp2", "pcre2",
  "sqlite", "toolchain", "xz", "zlib",
];

// All deps that provide shared libraries (for rpath-link)
const libDepNames = [
  "glib", "libffi", "pcre2", "json-glib", "libxml2", "libiconv",
  "xz", "zlib", "sqlite", "dbus", "expat", "libsoup3",
  "nghttp2", "libpsl", "libidn2", "libunistring",
];

const rpathLinkFlags = libDepNames.map((d) => `-Wl,-rpath-link,/deps/${d}/lib`).join(" ");

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["glib"],
    includeDeps: [
      "glib", "libffi", "pcre2", "json-glib", "libxml2", "libiconv",
      "sqlite", "dbus", "expat", "libsoup3", "nghttp2", "libpsl",
      "libidn2", "libunistring",
    ],
    includePaths: [
      "/deps/glib/include/glib-2.0",
      "/deps/glib/lib/glib-2.0/include",
      "/deps/libxml2/include/libxml2",
      "/deps/dbus/include/dbus-1.0",
      "/deps/dbus/lib/dbus-1.0/include",
    ],
    libDeps: libDepNames,
    pkgConfigDeps: [
      "glib", "libffi", "pcre2", "json-glib", "libxml2",
      "sqlite", "dbus", "libsoup3", "nghttp2", "libpsl",
      "libidn2", "libunistring", "zlib", "xz", "expat",
    ],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export LDFLAGS="$HOD_DUMMY_RPATH \\
  ${rpathLinkFlags}"

# Patch tracker-parser.c to resolve modules relative to the library itself
# using dladdr(), instead of a hardcoded absolute PRIVATE_LIBDIR.
# Without this, g_module_open("/lib/tinysparql-3.0/<module>") fails because
# the library is not installed at the filesystem root.
python3 << 'PYEOF'
with open('src/common/tracker-parser.c', 'r') as f:
    content = f.read()

# Add dladdr include and a helper function after the existing includes
old_include = '#include <gmodule.h>'
new_includes = '''#include <gmodule.h>
#include <dlfcn.h>

/* Resolve the parser module directory relative to this library's location.
 * Uses dladdr() to find the absolute path of libtinysparql, then computes
 * the sibling directory tinysparql-3.0/ where the parser modules live. */
static gchar *
get_private_libdir (void)
{
    Dl_info info;
    if (dladdr ((void *) get_private_libdir, &info) && info.dli_fname) {
        gchar *dir = g_path_get_dirname (info.dli_fname);
        gchar *result = g_build_filename (dir, "tinysparql-3.0", NULL);
        g_free (dir);
        return result;
    }
    return g_strdup ("/lib/tinysparql-3.0");  /* fallback */
}'''
content = content.replace(old_include, new_includes, 1)

# Replace the PRIVATE_LIBDIR path construction with our dladdr-based one
content = content.replace(
    'module_path = g_strdup_printf (PRIVATE_LIBDIR "/%s", modules[i]);',
    'module_path = g_build_filename (get_private_libdir (), modules[i], NULL);'
)

with open('src/common/tracker-parser.c', 'w') as f:
    f.write(content)
PYEOF

# Patch meson.build to bypass cc.run() checks and remove unnecessary subdirs.
# cc.run() compiles AND runs test programs, which fails in the sandbox.
python3 << 'PYEOF'
import re
with open('meson.build', 'r') as f:
    content = f.read()
# 1. Replace FTS5 check block (if/elif/endif) with hardcoded true.
#    Our sqlite is built with -DSQLITE_ENABLE_FTS5.
content = re.sub(
    r"if meson\\.is_cross_build\\(\\) and not meson\\.has_exe_wrapper\\(\\).*?^endif",
    "sqlite3_has_builtin_fts5 = true",
    content, count=1, flags=re.MULTILINE | re.DOTALL)
# 2. Replace strftime cc.run() block through its endif with hardcoded '%Y'.
content = re.sub(
    r"result = cc\\.run\\(.*?^endif",
    "year_modifier = '%Y'",
    content, count=1, flags=re.MULTILINE | re.DOTALL)
# 3. Remove subdirs that need tools we don't have or are unnecessary.
for s in ["subdir('po')", "subdir('fuzzing')", "subdir('examples')"]:
    content = content.replace(s + "\\n", "")
with open('meson.build', 'w') as f:
    f.write(content)
PYEOF

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Ddocs=false \\
  -Dman=false \\
  -Dtests=false \\
  -Dintrospection=disabled \\
  -Dvapi=disabled \\
  -Dsystemd_user_services=false \\
  -Dbash_completion=false \\
  -Dstemmer=disabled \\
  -Dunicode_support=unistring \\
  -Davahi=disabled \\
  -Doss_fuzz=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

# Fix absolute-path DT_NEEDED for sqlite3.
# Meson resolves the library to an absolute sandbox path and embeds it
# in the ELF DT_NEEDED. At runtime outside the sandbox this path doesn't
# exist. We replace it with the bare library name so the dynamic linker
# can find it via RUNPATH.
python3 -c "
import sys, re
import os
nul = bytes([0])
for root, dirs, files in os.walk('$OUT'):
    for name in files:
        path = os.path.join(root, name)
        try:
            with open(path, 'rb') as f:
                data = f.read()
        except:
            continue
        if data[:4] != b'\x7fELF':
            continue
        modified = False
        for m in list(re.finditer(rb'/[0-9a-f]{2}/[0-9a-f]{64}/lib/libsqlite3\.so', data)):
            start = m.start()
            end = data.index(nul, start)
            old = data[start:end]
            new = b'libsqlite3.so.0'
            replacement = new + nul * (len(old) - len(new))
            data = data[:start] + replacement + data[end:]
            modified = True
            print(f'  Patched DT_NEEDED in {path}: {old[:40]}... -> {new.decode()}')
        if modified:
            with open(path, 'wb') as f:
                f.write(data)
" 2>/dev/null || true

# Make pkg-config files relocatable.
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc" ;;
  esac
done

${STRIP_ALL}
`,
  deps: [
    dep("source", tinysparqlSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("json-glib", jsonGlibRecipe),
    dep("libxml2", libxml2Recipe),
    dep("libiconv", libiconvRecipe),
    dep("xz", xzRecipe),
    dep("zlib", zlibRecipe),
    dep("sqlite", sqliteRecipe),
    dep("dbus", dbusRecipe),
    dep("expat", expatRecipe),
    dep("libsoup3", libsoup3Recipe),
    dep("nghttp2", nghttp2Recipe),
    dep("libpsl", libpslRecipe),
    dep("libidn2", libidn2Recipe),
    dep("libunistring", libunistringRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: tinysparqlRuntimeDeps,
});

await importToStore(recipe);
export const tinysparqlRecipe = recipe;
