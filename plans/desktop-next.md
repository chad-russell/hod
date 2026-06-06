# Desktop Next: Audio, Networking, Portals, Shell Tools

**Status:** Active
**Date:** 2026-06-05
**Depends on:** Arch seed VM, niri milestone 1 complete

## Goal

Make Hod OS a daily-drivable desktop by filling the biggest gaps: audio,
networking, portal services, and basic shell utilities (launcher, bar,
notifications).

## Acceptance Criteria

- [ ] Audio plays through pipewire (speaker + mic)
- [ ] WiFi connects via NetworkManager + nmcli
- [ ] File chooser portal works (app can open/save files)
- [ ] App launcher works (fuzzel)
- [ ] Status bar shows clock, battery, volume (waybar)
- [ ] Notifications appear (mako)

## Phase 1: Audio — PipeWire Daemon

**Current state:** pipewire 1.4.7 and wireplumber 0.5.14 recipes exist but are
CLI-only (daemon disabled, tools-only).

### Work

1. **Enable pipewire daemon** — change `-Dexamples=disabled` or verify the
   daemon binary is already built and just needs installing. Key options to
   enable:
   - `-Dpw-cat=enabled` — needs libsndfile as new dep (recipe exists)
   - `-Dlibpulse=enabled` — builds pipewire-pulse (PulseAudio compat daemon)
   - Keep bluez5 disabled for now (requires bluez recipe later)

2. **Enable wireplumber daemon** — change `-Ddaemon=false` to `-Ddaemon=true`.
   Update wrapper script to handle the daemon binary in addition to wpctl.

3. **Systemd user services** — install pipewire.service, wireplumber.service,
   pipewire-pulse.service to `lib/systemd/user/`. The VM's hod-arch-build
   script already has a pattern for discovering and enabling services.

4. **Launch from niri session** — the `.bash_profile` niri launcher already
   runs `dbus-run-session`. Add `systemctl --user start pipewire wireplumber`
   or use `exec dbus-run-session` with pipewire launched before niri.

### New deps needed
- libsndfile (already has recipe)

### Estimated effort: small (mostly config changes to existing recipes)

---

## Phase 2: NetworkManager

### New recipes needed (build order)

1. **libndp** — IPv6 Neighbor Discovery Protocol. Small C library, autotools.
   No deps beyond toolchain.

2. **nettle** — Low-level crypto library. Autotools. Deps: toolchain.
   ~1.4M lines but straightforward build.

3. **libtasn1** — ASN.1 library. Autotools. No deps beyond toolchain.

4. **gnutls** — TLS library (NM's crypto backend). Autotools/ncftarball.
   Deps: nettle, libtasn1, libunistring (exists), libiconv (exists).

5. **elogind** — Standalone logind (session tracking, suspend/resume).
   Meson. Deps: dbus (exists), eudev (exists), linux-pam.
   This is the hardest new dep. Alpine packages it; their patches are a
   reference. Need to decide: build with PAM or without?
   - With PAM: need linux-pam recipe
   - Without PAM: elogind compiles but loses some session functionality

6. **polkit** — Authorization framework (non-root network control).
   Meson. Deps: dbus (exists), glib (exists), expat (exists).
   Can disable with `-Dpolkit=false` initially (root-only NM control).

7. **NetworkManager** — Meson. Deps: all above + glib, dbus, eudev, curl,
   readline, util-linux (all exist).

### Minimal meson options

```
-Dcrypto=gnutls
-Dsession_tracking=elogind
-Dwifi=true
-Dconfig_dhcp_default=internal
-Dconfig_plugins_default=keyfile
-Dmodem_manager=false
-Dovs=false
-Dteamdctl=false
-Dppp=false
-Dintrospection=false
-Ddocs=false
-Dtests=no
```

### Estimated effort: large (6 new recipes, elogind is tricky)

---

## Phase 3: XDG Desktop Portal

**Current state:** niri ships `niri-portals.conf` pointing to `gnome;gtk`
backends, but no portal packages exist. The COSMIC profile has a hand-written
C stub (`xdg-desktop-portal-stub`) that only implements Settings.Read — not
useful for niri.

### What niri needs

Niri's upstream docs recommend:
- `xdg-desktop-portal` (frontend multiplexer)
- `xdg-desktop-portal-gtk` (file chooser, app chooser, settings)
- `xdg-desktop-portal-gnome` (screencasting — requires niri built with
  `xdp-gnome-screencast` feature + pipewire)

For initial bring-up, **xdg-desktop-portal + xdg-desktop-portal-gtk** is
sufficient. Screencasting can come later.

### New recipes needed

1. **xdg-desktop-portal** — the portal frontend. Autotools or meson.
   Deps: glib, dbus, json-glib (need new recipe), fuse3 (exists).

2. **xdg-desktop-portal-gtk** — GTK portal backend. Meson.
   Deps: gtk3 (exists), glib, dbus, libportal (exists).

3. **json-glib** — JSON library for GLib. Meson.
   Deps: glib (exists).

### Existing recipes to reuse
- libportal (exists)
- gtk3 (exists, X11-only currently)
- fuse3 (exists)

### Note on GTK3 Wayland backend
xdg-desktop-portal-gtk itself only needs GTK3 for file dialogs — the X11
backend is sufficient. But waybar (Phase 5) needs GTK3 with Wayland. Consider
enabling `-Dwayland_backend=true` on GTK3 as a prerequisite for Phase 5.

### Estimated effort: medium (2-3 new recipes + minor config)

---

## Phase 4: Fuzzel (App Launcher)

### New recipes needed

1. **tllist** — header-only C typed linked list. Trivial meson wrap.
2. **fcft** — font rendering library. Meson. Deps: fontconfig, freetype,
   harfbuzz, pixman, tllist. All exist.
3. **fuzzel** — Meson. Deps: wayland, wayland-protocols, pixman,
   fontconfig, libxkbcommon, libpng, fcft, tllist. All exist.

Alternatively, use fuzzel's meson subproject wraps for fcft + tllist
(0 additional standalone recipes needed).

### Estimated effort: small (1-3 trivial recipes)

---

## Phase 5: Mako (Notifications)

**Note:** `recipes/native/mako/` is occupied by Python-Mako (template library
used by Mesa). The notification daemon needs a different name, e.g.
`recipes/native/mako-notify/`.

### New recipes needed

1. **basu** — standalone sd-bus implementation. Meson. Small library.
   This is what Alpine uses instead of libsystemd. No deep deps.
   Source: https://git.sr.ht/~emersion/basu

2. **mako-notify** — notification daemon. Meson. Deps: wayland, cairo,
   pango, gdk-pixbuf, basu. All exist.

### Estimated effort: small (2 new recipes)

---

## Phase 6: Waybar (Status Bar)

This is the hardest desktop tool — requires a C++ GTK binding chain.

### New recipes needed

1. **libsigc++-2.0** — C++ signal framework. Meson/autotools.
   Deps: toolchain only.

2. **glibmm** — C++ GLib wrapper. Meson. Deps: glib, libsigc++.

3. **cairomm** — C++ Cairo wrapper. Meson. Deps: cairo, libsigc++.

4. **pangomm** — C++ Pango wrapper. Meson. Deps: pango, cairomm, glibmm.

5. **atkmm** — C++ ATK wrapper. Meson. Deps: at-spi2-core, glibmm.

6. **gtkmm-3.0** — C++ GTK3 wrapper. Meson. Deps: gtk3, pangomm, atkmm,
   cairomm, glibmm, libsigc++.

7. **gtk-layer-shell** — Wayland layer shell for GTK. Meson.
   Deps: gtk3 (Wayland backend!), wayland.

8. **fmt** — C++ formatting. Meson. Can use meson subproject fallback.

9. **spdlog** — C++ logging. Meson. Deps: fmt. Can use fallback.

10. **waybar** — Meson. Deps: gtkmm-3.0, gtk-layer-shell, fmt, spdlog,
    wayland, libinput, playerctl, pulseaudio, wireplumber, libxkbcommon.

### Prerequisite: GTK3 Wayland backend

Current GTK3 recipe has `-Dwayland_backend=false`. Must enable:
```
-Dwayland_backend=true
```
This adds wayland, wayland-protocols, libxkbcommon as build deps (all exist).

### Optional waybar modules (can disable)
- libnl (network stats) → `-Dlibnl=disabled`
- upower (battery) → `-Dupower_glib=disabled`
- mpd (music) → `-Dmpd=disabled`
- pipewire (privacy) → `-Dpipewire=disabled`
- dbusmenu/tray → `-Ddbusmenu-gtk=disabled` (loses tray)

### Estimated effort: large (10 new recipes + GTK3 reconfiguration)

---

## VM Runner: EFI-Bootable Image

### Problem

Current images use direct kernel boot (`-kernel vmlinuz -initrd initramfs`),
requiring raw QEMU CLI. Most GUI VM managers (GNOME Boxes, virt-manager)
expect a bootable disk image with a bootloader.

### Solution

Modify `hod-arch-build` to produce an EFI-bootable image:
1. GPT partition table (not bare ext4)
2. EFI System Partition (FAT32, ~100MB)
3. systemd-boot as bootloader (already in the Arch rootfs via `systemd`)
4. Root partition (ext4)
5. Boot entry pointing to our kernel + initramfs

This unblocks GNOME Boxes (Flatpak), virt-manager, or any other VM runner.

### Estimated effort: medium (script changes only, no new recipes)

---

## Recommended build order

1. **Phase 1** (pipewire daemon) — quick win, biggest quality-of-life improvement
2. **Phase 4** (fuzzel) — trivial, immediate usability gain
3. **Phase 5** (mako) — small, needs only basu
4. **Phase 3** (xdg-desktop-portal) — medium, enables file dialogs
5. **Phase 6** (waybar) — large, requires C++ chain + GTK3 reconfiguration
6. **Phase 2** (NetworkManager) — large, can defer until testing on real hardware
7. **EFI image** — can do anytime, independent of recipes
