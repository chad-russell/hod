//! Flatpak profile — application sandboxing and distribution.
//!
//! Provides flatpak + all sandboxing helpers:
//!   - flatpak (OCI-like app distribution)
//!   - bubblewrap (sandbox)
//!   - xdg-dbus-proxy (D-Bus filtering)
//!   - fuse3 (filesystem-in-userspace for mounts)
//!   - ostree (content-addressed filesystem)
//!
//! System prerequisites (not packaged):
//!   - /etc/polkit-1 rules allowing flatpak system-helper (optional)
//!   - kernel: user namespaces, seccomp, overlayfs

import { flatpakRecipe } from "../recipes/native/flatpak/flatpak.js";
import { bubblewrapRecipe } from "../recipes/native/bubblewrap/bubblewrap.js";
import { xdgDbusProxyRecipe } from "../recipes/native/xdg-dbus-proxy/xdg-dbus-proxy.js";
import { fuse3Recipe } from "../recipes/native/fuse3/fuse3.js";
import { ostreeRecipe } from "../recipes/native/ostree/ostree.js";
import { gnupgRecipe } from "../recipes/native/gnupg/gnupg.js";

export const profile = {
  name: "flatpak",
  packages: [
    { name: "fuse3", recipe: fuse3Recipe },
    { name: "bubblewrap", recipe: bubblewrapRecipe },
    { name: "xdg-dbus-proxy", recipe: xdgDbusProxyRecipe },
    { name: "ostree", recipe: ostreeRecipe },
    { name: "gnupg", recipe: gnupgRecipe },
    { name: "flatpak", recipe: flatpakRecipe },
  ],
};
