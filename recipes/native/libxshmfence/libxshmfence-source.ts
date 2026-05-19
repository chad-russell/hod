//! libxshmfence source download.
//!
//! Shared memory fences library, needed by Mesa for DRI3.

import { fetchTarball } from "../../../js/src/index.js";

export const libxshmfenceSourceRecipe = await fetchTarball({
  url: "https://xorg.freedesktop.org/archive/individual/lib/libxshmfence-1.3.3.tar.xz",
  hash: "b6f6572eb8b8c44ecf0fadc53d86a030558ab2d210a1c2addd70822bdaacb7f3",
});
