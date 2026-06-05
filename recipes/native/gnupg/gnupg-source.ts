//! gnupg source download.
//!
//! gnupg 2.4.9 (oldstable) — GNU Privacy Guard.
//! Provides gpg binary for signature verification (needed by flatpak).
//! Uses 2.4.x instead of 2.5.x because 2.5 requires keyboxd daemon
//! for key storage, which doesn't work well with relocated binaries.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gnupg.org/ftp/gcrypt/gnupg/gnupg-2.4.9.tar.bz2",
  hash: "c3cd7b8c62bc07008f773a19fa8d78a6df241a726deb383ba1a66bb2f0e22fb5",
});

export const gnupgSourceRecipe = recipe;
