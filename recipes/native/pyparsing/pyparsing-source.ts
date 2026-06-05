//! pyparsing source download.
//!
//! pyparsing 3.3.2 — Python parsing library. Pure Python, no compilation needed.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://files.pythonhosted.org/packages/f3/91/9c6ee907786a473bf81c5f53cf703ba0957b23ab84c264080fb5a450416f/pyparsing-3.3.2.tar.gz",
  hash: "aea0d7b161353c3bd7a4ca7e2a31fc0ef9fa776ea5969daff5098b5030154cfe",
});

export const pyparsingSourceRecipe = recipe;
