//! libXtst source download.
//!
//! libXtst 1.2.5 — X Test extension library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://xorg.freedesktop.org/releases/individual/lib/libXtst-1.2.5.tar.xz",
  hash: "14daad01275697ffcacba237a3f1cf60cddfd0e5cfb25053c7a43fb282bf604c",
});

export const libXtstSourceRecipe = recipe;
