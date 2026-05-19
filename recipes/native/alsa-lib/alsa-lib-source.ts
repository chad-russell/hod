import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.alsa-project.org/files/pub/lib/alsa-lib-1.2.14.tar.bz2",
  hash: "210c41a2458a3642a63d1f728c18ecff3d7a48299c9a5dc096732396a4c7c270",
});

export const alsaLibSourceRecipe = recipe;
