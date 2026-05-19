//! packaging source download.
//!
//! packaging 25.0 — core utilities for Python packages.
//! Required by Mesa 26's meson.build for version checking (Python 3.12+
//! removed distutils.version which was the fallback).

import { fetchTarball } from "../../../js/src/index.js";

export const packagingSourceRecipe = await fetchTarball({
  url: "https://files.pythonhosted.org/packages/a1/d4/1fc4078c65507b51b96ca8f8c3ba19e6a61c8253c72794544580a7b6c24d/packaging-25.0.tar.gz",
  hash: "a0567f22e7aa06ec861c864e4abf68c163cd25419f42933e3186d91155b040b3",
});
