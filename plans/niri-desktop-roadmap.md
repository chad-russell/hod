# Niri Desktop Roadmap

**Status:** Active
**Date:** 2026-06-01
**Owner:** `recipes/native/niri/`, `profiles/niri-desktop.ts`, `scripts/hod-arch-build`
**Depends on:** `hod-arch-os.md`, existing Wayland/Mesa/libinput/seatd recipes

## Goal

Provide a small, usable Wayland desktop environment on the Arch-based Hod VM by
packaging Niri and a minimal set of companion tools. This is the current desktop
target while COSMIC is paused.

Niri is a compositor/window manager, not a full desktop environment. Hod will
own the small shell around it: terminal, notification daemon, optional launcher,
optional bar, and a minimal `config.kdl`.

## Why Niri First

Niri is much smaller than COSMIC:

- one compositor/session binary instead of a full DE stack
- one KDL config file instead of many COSMIC config schemas
- no COSMIC panel/applets/settings-daemon/OSD/theme stack
- optional helper apps can be added incrementally
- upstream packaging requirements are explicit and close to normal Wayland WM packaging

This makes it a better target for validating Hod's VM graphics/session layer.

## External References

NixOS packages Niri with:

- `dbus`
- `eudev` or `systemd`/libudev
- `libdisplay-info`
- `libgbm`
- `libglvnd` / `libEGL`
- `libinput`
- `libxkbcommon`
- `pango`
- `pipewire` only for screencast support
- `seatd`
- `wayland`

NixOS installs:

- `bin/niri`
- `bin/niri-session`
- `share/wayland-sessions/niri.desktop`
- `share/xdg-desktop-portal/niri-portals.conf`
- `lib/systemd/user/niri.service`
- `lib/systemd/user/niri-shutdown.target`
- default config docs

NixOS enables a portal stack and recommends `xdg-desktop-portal-gnome`, but we
will defer real screencast/portal support until the compositor boots reliably.

## Current Hod Assets

Already available:

- Arch seed VM with direct kernel boot
- `just run-local-gl` for render-node-capable QEMU graphics
- `seatd`
- `eudev`
- `libinput`
- `libdisplay-info`
- `libgbm` via Mesa
- `libglvnd`
- `libxkbcommon`
- `pango`
- `wayland`
- `alacritty`
- `mako` name collision: current `recipes/native/mako` is Python Mako, **not** the Wayland notification daemon
- `pipewire` / `wireplumber`
- `xwayland-satellite` recipe exists but still expects an Xwayland server binary

Likely missing for a comfortable session:

- `niri`
- `fuzzel`
- `waybar`
- `swaybg`
- real `xdg-desktop-portal`
- `xdg-desktop-portal-gtk` or `xdg-desktop-portal-gnome`
- a notification daemon recipe under a non-conflicting name, e.g. `mako-notifier`

## Milestone 1: Minimal Usable Niri VM

Acceptance criteria:

- `profiles/niri-desktop.ts` builds and activates
- VM boots via `just run-local-gl`
- tty1 autologin starts `niri --session` or patched `niri-session`
- `/dev/dri/renderD128` exists in the guest
- `niri msg outputs` works inside the session
- `Mod+T` opens `alacritty`
- CPU usage is idle/sane after startup

Scope:

- package `niri`
- create `profiles/niri-desktop.ts`
- generate `/home/hod/.config/niri/config.kdl`
- add Niri detection/startup branch to `scripts/hod-arch-build`
- no bar/launcher/wallpaper required for first boot

## Milestone 2: Basic Shell

Acceptance criteria:

- background is visible
- notifications work
- app launcher works
- optional Xwayland path is documented or disabled

Likely packages:

- `swaybg`
- Wayland Mako notification daemon as `mako-notifier`
- `fuzzel`
- `xwayland` proper, or keep `xwayland-satellite` out of default config

## Milestone 3: Polished Session

Acceptance criteria:

- bar/status UI works
- portal file chooser and basic settings portal work
- session uses installed `niri-session` and systemd user unit semantics where practical

Likely packages:

- `waybar`
- real `xdg-desktop-portal`
- `xdg-desktop-portal-gtk` first, GNOME portal later if screencast is needed
- `wl-clipboard`, `grim`, `slurp`, `swaylock`, `playerctl` as optional conveniences

## Implementation Notes

- Do not use upstream default config unmodified: it spawns `waybar`, binds
  `fuzzel`, and binds `swaylock`, which Hod may not package yet.
- Generate a Hod-specific minimal KDL config for the `hod` user.
- Prefer `just run-local-gl` for graphical validation. Plain `virtio-vga` lacks
  the render-node path needed by modern Wayland compositor testing.
- Avoid baking runtime state from `/home/hod/.local/state` into disk images.
- Keep COSMIC-specific portal stubs out of the Niri profile.

## Open Questions

- Can we build Niri from the normal source tree with Cargo network access, or
  should we use the upstream vendored dependency tarball for reproducibility?
- Should the first recipe enable `systemd`, or start with `dbus` only and run
  `niri --session` from the login shell?
- Do we package full `xwayland` now, or defer X11 apps until the pure Wayland
  session works?
