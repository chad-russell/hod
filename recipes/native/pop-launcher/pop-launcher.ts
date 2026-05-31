//! pop-launcher — Launcher service and plugin framework for COSMIC desktop.
//!
//! Backend service that provides app search, calculation, and other
//! launcher functionality via a plugin system.

import { cosmicApp } from "../../helpers/cosmic.js";
import { PopLauncherSourceRecipe } from "./pop-launcher-source.js";

export const popLauncherRecipe = await cosmicApp({
  name: "pop-launcher-bin",  // workspace bin crate name
  source: PopLauncherSourceRecipe,
  // pop-launcher has plugins that use cosmic-client-toolkit (wayland)
  // and reqwest with rustls-tls (no openssl needed)
  // Must specify -p pop-launcher-bin to build the binary from the workspace
  cargoFlags: ["-p", "pop-launcher-bin"],
  postInstallScript: `
# pop-launcher dispatches behavior from argv[0]. The Cargo package installs a
# single binary, but COSMIC expects the service and plugins by these names.
ln -sf pop-launcher-bin $OUT/bin/pop-launcher

mkdir -p $OUT/lib/pop-launcher/plugins
for plugin in calc cosmic_toplevel desktop_entries files find pop_shell pulse recent scripts terminal web; do
  case "$plugin" in
    cosmic_toplevel) cmd=cosmic-toplevel ;;
    desktop_entries) cmd=desktop-entries ;;
    pop_shell) cmd=pop-shell ;;
    *) cmd="$plugin" ;;
  esac
  mkdir -p "$OUT/lib/pop-launcher/plugins/$plugin"
  cp "/tmp/build/plugins/src/$plugin/plugin.ron" "$OUT/lib/pop-launcher/plugins/$plugin/plugin.ron"
  if [ -f "/tmp/build/plugins/src/$plugin/config.ron" ]; then
    cp "/tmp/build/plugins/src/$plugin/config.ron" "$OUT/lib/pop-launcher/plugins/$plugin/config.ron"
  fi
  ln -sf ../../../../bin/pop-launcher-bin "$OUT/lib/pop-launcher/plugins/$plugin/$cmd"
done
`,
});
