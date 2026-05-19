//! libXxf86vm source download.
//!
//! XFree86-VidMode X extension library, needed by Mesa for GLX.

import { fetchTarball } from "../../../js/src/index.js";

export const libXxf86vmSourceRecipe = await fetchTarball({
  url: "https://xorg.freedesktop.org/archive/individual/lib/libXxf86vm-1.1.7.tar.xz",
  hash: "54af9fb042d559b98a47524e3a81638882c9f881c2c4676f25d9486460fbfd24",
});
