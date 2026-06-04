# COSMIC Desktop — Paused

**Status:** Paused
**Current authority:** This file for paused-state summary; recipes in `recipes/native/cosmic-*/`

## Why paused

All 18 of 19 COSMIC components build from source. `cosmic-comp` runs in the Arch
VM and renders normal Wayland clients. However, the desktop shell is not usable.
The remaining gaps are distro-integration issues, not build problems:

- Recipes copied binaries instead of using upstream install targets, so
  `/share/cosmic`, D-Bus activation files, systemd user units, wallpaper assets,
  and applet metadata are incomplete
- Broad `--no-default-features` diverged from Arch/NixOS package choices
- Portal stack not packaged
- `cosmic-settings-daemon` and `cosmic-osd` spin at ~100% CPU in the VM

## What's built

| Component | Status |
|-----------|--------|
| cosmic-comp | Built |
| cosmic-session | Built |
| cosmic-panel | Built |
| cosmic-settings | Built |
| cosmic-files | Built |
| cosmic-edit | Built |
| cosmic-term | Built |
| cosmic-launcher | Built |
| cosmic-bg, cosmic-idle, cosmic-randr | Built |
| cosmic-notifications, cosmic-osd, cosmic-screenshot | Built |
| cosmic-workspaces-epoch, cosmic-applets, cosmic-applibrary | Built |
| cosmic-icons | Built (data-only) |
| pop-launcher | Built |
| xdg-desktop-portal-cosmic | Blocked by bindgen |

All recipes live under `recipes/native/cosmic-*/` and share the `cosmicApp()`
helper in `recipes/helpers/cosmic.ts`. The COSMIC profile is
`profiles/cosmic-desktop.ts`.

## Resume prerequisites

COSMIC should resume after Hod gains:

1. **Upstream install target support** — use `make install`/`cargo install`
   instead of manually copying binaries
2. **Real portal packaging** — `xdg-desktop-portal` + a backend
3. **systemd user unit + D-Bus activation** infrastructure
4. **Hermetic bindgen** — unblocks `xdg-desktop-portal-cosmic` (see
   `bindgen-infrastructure.md`)

The Niri desktop (`niri-desktop-roadmap.md`) is the active desktop target while
COSMIC is paused.
