# Niri Desktop Roadmap

**Status:** Active — Milestone 1 complete
**Date:** 2026-06-01, updated 2026-06-03
**Owner:** `recipes/native/niri/`, `profiles/niri-desktop.ts`, `scripts/hod-arch-build`
**Depends on:** Arch seed VM (`scripts/hod-arch-build`), existing Wayland/Mesa/libinput/seatd recipes

## Goal

Provide a small, usable Wayland desktop environment on the Arch-based Hod VM by
packaging Niri and a minimal set of companion tools.

## Why Niri First

- one compositor/session binary instead of a full DE stack
- one KDL config file instead of many COSMIC config schemas
- optional helper apps can be added incrementally

## Milestone 1: Minimal Usable Niri VM — DONE

- [x] `profiles/niri-desktop.ts` builds and activates
- [x] VM boots via `just run-local-gl`
- [x] tty1 autologin starts niri session
- [x] `Mod+Return` opens `alacritty`
- [x] `Mod+Shift+E` brings up quit dialog
- [x] CPU usage is idle/sane after startup

Bug fixed during this milestone: `relocate.rs` only added runtime_deps to
RUNPATH if they matched a `DT_NEEDED` entry. Libraries loaded dynamically
via `dlopen` (e.g., `libwayland-client.so` by winit) were missed. Fixed by
adding all runtime_dep outputs with `lib/` directories to the RUNPATH.

## Milestone 2: Polished Session

Acceptance criteria:

- bar/status UI works
- portal file chooser and basic settings portal work
- session uses installed `niri-session` and systemd user unit semantics where practical

Likely packages:

- `waybar`
- real `xdg-desktop-portal`
- `xdg-desktop-portal-gtk`
- `wl-clipboard`, `grim`, `slurp`, `swaylock`, `playerctl` as optional conveniences

## Implementation Notes

- Generate a Hod-specific minimal KDL config for the `hod` user
- Prefer `just run-local-gl` for graphical validation
- Avoid baking runtime state from `/home/hod/.local/state` into disk images
- Keep COSMIC-specific portal stubs out of the Niri profile
