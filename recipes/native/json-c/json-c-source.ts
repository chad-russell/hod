//! json-c source download.
//!
//! json-c 0.18 — JSON manipulation library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://s3.amazonaws.com/json-c_releases/releases/json-c-0.18.tar.gz",
  hash: "adc5d92666507b0746962226bd009d33c4db2195cc7aff079e40bd83ec2ffad0",
});

export const jsonCSourceRecipe = recipe;
