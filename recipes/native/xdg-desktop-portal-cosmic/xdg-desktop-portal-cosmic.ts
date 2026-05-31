//! xdg-desktop-portal-cosmic — XDG desktop portal backend for COSMIC.
//!
//! Implements the XDG desktop portal interfaces for COSMIC, enabling
//! sandboxed apps to request file access, screenshots, screen sharing, etc.

import { cosmicApp } from "../../helpers/cosmic.js";
import { XdgDesktopPortalCosmicSourceRecipe } from "./xdg-desktop-portal-cosmic-source.js";

export const xdgDesktopPortalCosmicRecipe = await cosmicApp({
  name: "xdg-desktop-portal-cosmic",
  source: XdgDesktopPortalCosmicSourceRecipe,
  bindgen: true,
  postInstallScript: `
mkdir -p $OUT/libexec $OUT/share/dbus-1/services $OUT/lib/systemd/user \
  $OUT/share/xdg-desktop-portal/portals $OUT/share/xdg-desktop-portal
ln -sf ../bin/xdg-desktop-portal-cosmic $OUT/libexec/xdg-desktop-portal-cosmic

cat > $OUT/share/dbus-1/services/org.freedesktop.impl.portal.desktop.cosmic.service <<EOF
[D-BUS Service]
Name=org.freedesktop.impl.portal.desktop.cosmic
Exec=/usr/hod/system/current/pkgs/xdg-desktop-portal-cosmic/libexec/xdg-desktop-portal-cosmic
EOF

cat > $OUT/lib/systemd/user/xdg-desktop-portal-cosmic.service <<EOF
[Unit]
Description=Portal service (COSMIC implementation)

[Service]
Type=dbus
BusName=org.freedesktop.impl.portal.desktop.cosmic
ExecStart=/usr/hod/system/current/pkgs/xdg-desktop-portal-cosmic/libexec/xdg-desktop-portal-cosmic
EOF

cat > $OUT/share/xdg-desktop-portal/portals/cosmic.portal <<EOF
[portal]
DBusName=org.freedesktop.impl.portal.desktop.cosmic
Interfaces=org.freedesktop.impl.portal.Access;org.freedesktop.impl.portal.FileChooser;org.freedesktop.impl.portal.Screenshot;org.freedesktop.impl.portal.Settings;org.freedesktop.impl.portal.ScreenCast
UseIn=COSMIC
EOF

cat > $OUT/share/xdg-desktop-portal/cosmic-portals.conf <<EOF
[preferred]
default=cosmic;gtk;
org.freedesktop.impl.portal.Secret=gnome-keyring;
EOF
`,
});
