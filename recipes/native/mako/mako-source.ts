//! Mako source downloads.
//!
//! Mako 1.3.12 is a Python template library required by Mesa's build system
//! to generate source code from .mako template files.
//!
//! MarkupSafe 3.0.3 is a required dependency of Mako (HTML/string escaping).

import { fetchTarball } from "../../../js/src/index.js";

export const makoSourceRecipe = await fetchTarball({
  url: "https://files.pythonhosted.org/packages/00/62/791b31e69ae182791ec67f04850f2f062716bbd205483d63a215f3e062d3/mako-1.3.12.tar.gz",
  hash: "2aeed079ee659e83dae96cfa2198507a2a691cf5f5e9586423799ad951580fd2",
});

export const markupsafeSourceRecipe = await fetchTarball({
  url: "https://files.pythonhosted.org/packages/7e/99/7690b6d4034fffd95959cbe0c02de8deb3098cc577c67bb6a24fe5d7caa7/markupsafe-3.0.3.tar.gz",
  hash: "31c0e30de872706dfc7789faa8f991527fb66ade1da83e78320c794af64e6da5",
});
