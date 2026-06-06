# Next Packages to Port

Sourced from the ThinkPad (crussell@192.168.20.27) NixOS config at `~/Code/cn/thinkpad`.
These are things actively used there that don't yet have recipes under `recipes/native/`.

---

## Tier 1: CLI tools used daily (quick wins)

Best ROI — exercise existing `cargoBuild` and `goBuild` helpers with real daily-driver tools.

- [x] **oh-my-posh** — Shell prompt (Go, `goBuild`)
- [x] **yazi** — TUI file manager (Rust, `cargoBuild`)
- [x] **github-cli** (`gh`) — Daily dev tool (Go, `goBuild`)

## Tier 2: Wayland laptop essentials (small C/Meson)

Proves the meson helper and C toolchain handle the Wayland ecosystem.
These are bound to keybindings in the ThinkPad config.

- [x] **wl-clipboard** — Wayland clipboard (`wl-copy`/`wl-paste`) (C/Meson)
- [x] **brightnessctl** — Screen brightness control (C/Makefile)
- [x] **playerctl** — Media key / MPRIS control (C/Meson)
- [x] **grim** — Screenshot capture (C/Meson)
- [x] **slurp** — Screen region selector (C/Meson)
- [ ] **swaylock** — Screen locker (C/Meson, may need PAM)

## Tier 3: Infra / heavier CLI tools

Stress-tests deeper dependency chains and more complex build systems.

- [ ] **ethtool** — Network interface config (C/Autotools; used in ThinkPad dispatcher script)
- [ ] **nodejs** — Needed by `pi install` for extension deps (C++/Python/gyp — notoriously hard)

## Tier 4: GUI apps (proves the full GUI pipeline)

These would be major milestones beyond Geany, exercising GTK4, libadwaita, or Zig.

- [ ] **nautilus** (GNOME Files) — File manager, deep GTK4/libadwaita stack (Meson/C — hard)

## Tier 5: Wayland compositor ecosystem

Would prove hod can build compositors and Wayland platform tooling.

- [ ] **xwayland-satellite** — X11 compat for Wayland compositors (Meson/Rust — hard)
