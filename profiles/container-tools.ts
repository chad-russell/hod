//! Container tools profile — podman + distrobox for containerized environments.
//!
//! Provides a full container stack:
//!   - podman (OCI container engine, built without systemd)
//!   - crun (fast OCI runtime)
//!   - conmon (container monitor)
//!   - pasta (rootless networking)
//!   - netavark + aardvark-dns (container networking)
//!   - distrobox (shell wrappers for tightly integrated containers)
//!
//! Distrobox auto-detects podman on PATH. When this profile is activated,
//! all container tools are available and distrobox works out of the box.
//!
//! Prerequisites (not packaged — system-level setup):
//!   - /etc/subuid and /etc/subgid entries for the user
//!   - newuidmap and newgidmap (from shadow-utils)
//!   - Kernel: user namespaces, cgroups v2, overlayfs
//!
//! See docs/podman-setup.md for full setup instructions.

import { podmanRecipe } from "../recipes/native/podman/podman.js";
import { crunRecipe } from "../recipes/native/crun/crun.js";
import { conmonRecipe } from "../recipes/native/conmon/conmon.js";
import { passtRecipe } from "../recipes/native/passt/passt.js";
import { netavarkRecipe } from "../recipes/native/netavark/netavark.js";
import { aardvarkDnsRecipe } from "../recipes/native/aardvark-dns/aardvark-dns.js";
import { distroboxRecipe } from "../recipes/native/distrobox/distrobox.js";
import { containersConfigRecipe } from "../recipes/native/containers-config/containers-config.js";

export const profile = {
  name: "container-tools",
  packages: [
    { name: "containers-config", recipe: containersConfigRecipe },
    { name: "crun", recipe: crunRecipe },
    { name: "conmon", recipe: conmonRecipe },
    { name: "passt", recipe: passtRecipe },
    { name: "netavark", recipe: netavarkRecipe },
    { name: "aardvark-dns", recipe: aardvarkDnsRecipe },
    { name: "podman", recipe: podmanRecipe },
    { name: "distrobox", recipe: distroboxRecipe },
  ],
};
