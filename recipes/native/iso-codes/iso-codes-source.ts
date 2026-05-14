//! iso-codes source download.
//!
//! iso-codes 4.18.0 — ISO country, language, script and currency codes.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://deb.debian.org/debian/pool/main/i/iso-codes/iso-codes_4.18.0.orig.tar.xz",
  hash: "3520791702eefc270d77fd407db822d64a862ae31615f91eb76c647c8d85bed2",
});

export const isoCodesSourceRecipe = recipe;
