//! Lua source download.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.lua.org/ftp/lua-5.4.8.tar.gz",
  hash: "45140b41a5847cb8b40f6e01a1bbb35cb41fda89acc81482410cde8632d812f6",
});

export const luaSourceRecipe = recipe;
