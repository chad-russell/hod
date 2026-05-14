//! sassc source download (includes libsass).
//!
//! sassc 3.6.2 + libsass 3.6.5 — Sass CSS compiler.
//! libsass is built as a static library, then sassc is linked against it.

import { fetchTarball } from "../../../js/src/index.js";

const libsassSource = await fetchTarball({
  url: "https://github.com/sass/libsass/archive/refs/tags/3.6.5.tar.gz",
  hash: "e3f4d3691bb7335d8571ea8f3b79f38294a331d65b5b952242178881c1f12d4b",
});

const sasscSource = await fetchTarball({
  url: "https://github.com/sass/sassc/archive/refs/tags/3.6.2.tar.gz",
  hash: "b335ce7f38763cbd5a3733dcb9032fb7f2a15fe7f70199612ca1748639c72d47",
});

export const libsassSourceRecipe = libsassSource;
export const sasscSourceRecipe = sasscSource;
