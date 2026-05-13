//! libXdmcp source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libXdmcp-1.1.5.tar.xz",
  hash: "d93c5ceb04019228ee6f034c4d10826025a7ae756d7b2f884fc2f768577173ba",
});

await importToStore(recipe);
export const libXdmcpSourceRecipe = recipe;
