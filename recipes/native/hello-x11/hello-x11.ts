//! hello-x11 build recipe — minimal X11 graphical proof-of-concept.
//!
//! Builds a tiny Xlib program that opens a window and draws "Hello Hod!".

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libX11Recipe, libX11RuntimeDeps } from "../libX11/libX11.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { cProfile } from "../../helpers/c.js";

export const helloX11RuntimeDeps = ["libX11", ...libX11RuntimeDeps];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["xorgproto", "libX11"],
    libDeps: ["libX11", "libXcb", "libXau", "libXdmcp"],
    pkgConfigDeps: ["libX11", "libXcb", "libXau", "libXdmcp"],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto" to pkgConfigDeps and remove this pkgConfigPaths block.
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig"],
  }),
  script: `

mkdir -p $OUT/bin /tmp/build
cat > /tmp/build/hello-x11.c <<'EOF'
#include <X11/Xlib.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    Display *d = XOpenDisplay(NULL);
    if (!d) {
        fprintf(stderr, "hello-x11: could not open display (set DISPLAY)\\n");
        return 1;
    }

    int s = DefaultScreen(d);
    Window w = XCreateSimpleWindow(d, RootWindow(d, s), 100, 100, 400, 300, 1,
                                   BlackPixel(d, s), WhitePixel(d, s));
    XSelectInput(d, w, ExposureMask | KeyPressMask | StructureNotifyMask);
    XMapWindow(d, w);

    const char *msg = "Hello Hod!";
    for (;;) {
        XEvent e;
        XNextEvent(d, &e);
        if (e.type == Expose) {
            XDrawString(d, w, DefaultGC(d, s), 150, 150, msg, (int)strlen(msg));
        } else if (e.type == KeyPress) {
            break;
        } else if (e.type == DestroyNotify) {
            break;
        }
    }

    XCloseDisplay(d);
    return 0;
}
EOF

$CC $CFLAGS $HOD_DUMMY_RPATH -o $OUT/bin/hello-x11 /tmp/build/hello-x11.c $(pkg-config --cflags --libs x11)
/deps/toolchain/bin/strip $OUT/bin/hello-x11 2>/dev/null || true
`,
  deps: [
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libX11", libX11Recipe),
    dep("libXau", libXauRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("libXcb", libXcbRecipe),
  ],
  runtime_deps: helloX11RuntimeDeps,
});

await importToStore(recipe);
export const helloX11Recipe = recipe;
