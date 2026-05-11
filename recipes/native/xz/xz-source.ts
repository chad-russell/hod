//! xz source download.
import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/tukaani-project/xz/releases/download/v5.8.3/xz-5.8.3.tar.gz",
  hash: "80056b186e5fc54d4653c1163bc317ee690bf7fcfec890f2d29710319fe13816",
});

export const xzSourceRecipe = recipe;
