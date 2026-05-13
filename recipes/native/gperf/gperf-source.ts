//! gperf source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://ftp.gnu.org/gnu/gperf/gperf-3.3.tar.gz",
  hash: "6ad90515e3b8ac191a8ecef4e75fbb260236f8e78078ac099d5eccc175af0782",
});

await importToStore(recipe);
export const gperfSourceRecipe = recipe;
