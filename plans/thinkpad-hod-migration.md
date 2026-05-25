# ThinkPad Hod Migration

**Status:** Active
**Date:** 2026-05-22
**Current authority:** `docs/profiles.md`, `docs/closure-transfer.md`, `src/profile.rs`, `src/closure.rs`, and the ThinkPad config in `/home/crussell/Code/cn/thinkpad` on the ThinkPad.

## Goal

Move the ThinkPad from "Nix/Home Manager installs almost all user software" toward "Nix owns the operating system and session substrate; Hod owns user packages and source-built application stacks."

The near-term target is not to remove Nix. NixOS should continue to own boot, hardware, kernel, system services, users, secrets, network, portals, fonts, and emergency fallback tooling. Hod should progressively own portable userland tools and GUI applications that can be built remotely and copied as closures.

## Current ThinkPad Split

### Keep In Nix For Now

These are system/session responsibilities where NixOS is still the right owner:

- bootloader, kernel, kernel params, sysctl, firmware, thermal/power management
- NetworkManager, resolved split DNS, Nebula, OpenSSH server, firewall
- user account and login shell registration
- PipeWire, D-Bus, gnome-keyring, Flatpak service, Podman
- XDG desktop portals and compositor modules: Niri, Hyprland, Mango, Plasma fallback
- KDE Connect, Bluetooth, fwupd, node exporter
- fonts and fontconfig while Hod font/profile story is immature
- agenix secrets and Home Manager file/config deployment
- VPN packages with privileged/system integration: GlobalProtect, Proton VPN, NetworkManager plugins

### Already Good Hod Candidates

These are in the ThinkPad package lists and already have Hod recipes or close equivalents:

- `ripgrep` -> `recipes/native/rust/ripgrep/ripgrep.ts`
- `fd` -> `recipes/native/rust/fd/fd.ts`
- `bat` -> `recipes/native/rust/bat/bat.ts`
- `eza` -> `recipes/native/rust/eza/eza.ts`
- `git` -> `recipes/native/git/git.ts`
- `curl` -> `recipes/native/curl/curl.ts`
- `wget` -> `recipes/native/wget/wget.ts`
- `jq` -> `recipes/native/jq/jq.ts`
- `yazi` -> `recipes/native/rust/yazi/yazi.ts`
- `fzf` -> `recipes/native/fzf/fzf.ts`
- `zoxide` -> `recipes/native/rust/zoxide/zoxide.ts`
- `oh-my-posh` -> `recipes/native/oh-my-posh/oh-my-posh.ts`
- `brightnessctl` -> `recipes/native/brightnessctl/brightnessctl.ts`
- `python3` -> `recipes/native/python/python.ts`
- `nodejs` -> `recipes/native/nodejs/nodejs.ts`
- `github-cli` -> `recipes/native/github-cli/github-cli.ts`
- `grim` -> `recipes/native/grim/grim.ts`
- `slurp` -> `recipes/native/slurp/slurp.ts`
- `wl-clipboard` -> `recipes/native/wl-clipboard/wl-clipboard.ts`
- `playerctl` -> `recipes/native/playerctl/playerctl.ts`
- `nautilus` -> `recipes/native/nautilus/nautilus.ts`
- `alacritty` -> `recipes/native/alacritty/alacritty.ts`
- supporting CLI replacements already built: `bash`, `coreutils`, `grep`, `sed`, `gawk`, `less`, `tree`, `htop`, `strace`, `rsync`, `openssh`, `vim`, `nano`, `ncdu`

### Needs Hod Recipe Or UX Work

These are user packages from the current ThinkPad config that still need a Hod recipe or packaging decision:

- `zed-editor-fhs`
- `swaylock`
- `incus`, `virt-viewer`
- `slack`, `vesktop`, `zoom-us`, `localsend`, `voxtype`
- `claude-code`, `opencode`, `pi-coding-agent`, `antigravity-cli`
- Neovim 0.12 plus plugins/LSP stack from `nixvim`
- language tooling from Nixvim: `typescript-language-server`, `pyright`, `lua-language-server`, `prettierd`

Recent progress now covered by Hod recipes/profiles:

- `bun` -> `recipes/native/bun/bun.ts`, included in `profiles/thinkpad-dev.ts`
- `unzip` -> `recipes/native/unzip/unzip.ts`, included in `profiles/thinkpad.ts`
- `distrobox` -> `recipes/native/distrobox/distrobox.ts`, included in `profiles/thinkpad-dev.ts`
- `wireplumber` CLI -> `recipes/native/wireplumber/wireplumber.ts`, included in `profiles/thinkpad-gui.ts`; PipeWire service remains Nix-owned
- `xwayland-satellite` -> `recipes/native/xwayland-satellite/xwayland-satellite.ts`, included in `profiles/thinkpad-gui.ts`; Xwayland server still comes from the host
- `stylua` -> `recipes/native/rust/stylua/stylua.ts`, included in `profiles/thinkpad-dev.ts`
- `ruff` -> `recipes/native/rust/ruff/ruff.ts`, included in `profiles/thinkpad-dev.ts`
- `rust-analyzer` -> `recipes/native/rust/rust-analyzer/rust-analyzer.ts`, included in `profiles/thinkpad-dev.ts`
- `markdown-oxide` -> `recipes/native/rust/markdown-oxide/markdown-oxide.ts`, included in `profiles/thinkpad-dev.ts`

### Audit Snapshot: 2026-05-22

Current ThinkPad Nix/Home Manager package lists were audited against `recipes/native/**`.

Already in `profiles/thinkpad.ts` and deployed:

- `ripgrep`, `fd`, `bat`, `eza`, `git`, `curl`, `wget`, `jq`, `yazi`, `zoxide`
- `file`, `htop`, `less`, `ncdu`, `openssh`, `pv`, `rsync`, `strace`, `tree`

Already have Hod recipes but are not yet in the ThinkPad profile:

- CLI/dev: `fzf`, `oh-my-posh`, `github-cli`, `python3`, `nodejs`
- Wayland/GUI utilities: `alacritty`, `grim`, `slurp`, `wl-clipboard`, `playerctl`, `brightnessctl`, `nautilus`

Need new Hod recipes or a packaging policy before migration:

- Dev/runtime tooling: language servers and remaining formatters
- Wayland/session utilities: `swaylock`
- VM/remote tooling: `incus`, `virt-viewer`
- Vendor/Electron/proprietary/fast-moving apps: `zed-editor-fhs`, `slack`, `vesktop`, `zoom-us`, `localsend`, `voxtype`, `claude-code`, `opencode`, `pi-coding-agent`, `antigravity-cli`

### Probably Keep Outside Hod Longer

These are possible eventually, but should not block the first migration:

- browsers (`zen-browser`) because browser packaging is large, security-sensitive, and update-sensitive
- Flatpak apps used for vendor GUI apps until Hod has an Electron/AppImage/vendor-binary policy
- compositor/session packages until COSMIC/desktop VM work defines a complete Hod-owned graphical stack
- VPN clients and NetworkManager integration
- fonts and theme packages until profiles and XDG data integration are smoother

## Desired End-State Shape

Nix should declare OS, hardware, services, users, secrets, portals, compositors, stable config files, and a small fallback tool set. Hod should declare profiles for day-to-day CLI tools, developer tools, and known-good GUI apps, with remote build/copy commands so the ThinkPad consumes closures instead of building them.

Suggested Hod profiles:

- `profiles/thinkpad.ts` for daily CLI and GUI packages
- `profiles/thinkpad-dev.ts` for language servers, formatters, and dev tools
- `profiles/thinkpad-gui.ts` for graphical apps that are known to run after transfer

## Remote Build Design

Current workflow is workable but too manual:

```bash
hod build ./recipes/native/alacritty/alacritty.ts
hod copy-closure ./recipes/native/alacritty/alacritty.ts --to crussell@10.10.0.10
```

Target workflow should be one command from the ThinkPad or from the build host.

### Phase 1: Push-Based Build Host Workflow

Run on the build machine:

```bash
hod deploy ./profiles/thinkpad.ts --to crussell@10.10.0.10 --activate
```

Semantics:

1. evaluate the profile via Bun
2. build all profile roots locally on the build machine
3. copy each runtime closure to the ThinkPad
4. build or update the Hod profile farm on the ThinkPad
5. print the remote activation path

This can initially be a shell script in `scripts/` before becoming a Rust subcommand.

### Phase 2: Pull-Based Remote Builder Workflow

Run on the ThinkPad:

```bash
hod remote build ./profiles/thinkpad.ts --builder bee
hod remote activate ./profiles/thinkpad.ts
```

Semantics:

1. ThinkPad sends recipe/profile input to builder
2. builder evaluates and builds
3. ThinkPad pulls/copies the closure back
4. local profile activates from local store

This needs either `copy-closure --from` or a new `hod pull-closure` flow. It also needs a clear convention for source paths: profile paths on builder, git revision, or transferred profile bundle.

### Phase 3: Binary Cache-Like Store Sync

Longer term:

- expose a simple Hod store server or SSH protocol for `recipes/`, `blobs/`, `staging/`, and metadata
- let clients ask "do you have output for recipe hash X?"
- copy only missing content-addressed objects
- avoid copying the whole mutable `hod.db`; instead import metadata entries deterministically

## Nix Integration Design

Start simple: Nix should not know every Hod package. It should know one activation path.

Home Manager can source a generated env script:

```nix
programs.zsh.initContent = ''
  if [ -f "$HOME/.hod/profiles/thinkpad/env.sh" ]; then
    source "$HOME/.hod/profiles/thinkpad/env.sh"
  fi
'';
```

Better after profiles mature:

- add a small `hod-profile.nix` Home Manager module
- configure profile name and env path declaratively
- optionally add systemd user service/timer for validation

Avoid having Nix invoke remote Hod builds during `nixos-rebuild switch` at first. Rebuilds should remain reliable and not depend on the build host being online.

## Migration Phases

### Phase 0: Stabilize Hod Profile UX

Exit criteria:

- `hod profile activate profiles/thinkpad.ts` works locally
- profile farms expose package `bin/` dirs on `PATH`
- wrappers work for GUI apps after transfer
- profiles have a reasonable GC/root story or at least documented manual roots

Tasks:

- create `profiles/thinkpad.ts` with already-built CLI packages (done)
- add `alacritty` as first GUI profile package
- verify activation on the ThinkPad from copied closures
- add docs for "install profile on laptop from build host"

### Phase 1: Replace Low-Risk CLI Packages

Move these from Home Manager `home.packages` to Hod profile first. Items marked
done are already in `profiles/thinkpad.ts`:

- done: `ripgrep`, `fd`, `bat`, `eza`, `git`, `curl`, `wget`, `jq`, `yazi`, `zoxide`
- done: `fzf`, `oh-my-posh`, `github-cli`, `python3`, `unzip`

Keep Nix fallback temporarily for:

- `git`, `curl`, `python3`, `openssh`, `rsync`

Rationale: these are critical recovery tools. Remove Nix fallbacks only after profile activation survives reboot and path ordering is understood.

### Phase 2: Replace Lightweight GUI/Wayland Utilities

Move after runtime transfer has been tested repeatedly:

- existing recipes to add to `profiles/thinkpad-gui.ts`: `alacritty`, `grim`, `slurp`, `wl-clipboard`, `playerctl`, `brightnessctl`, `nautilus`
- first new Wayland recipe gaps: `swaylock`, then `xwayland-satellite`

Keep in Nix for now:

- ``swaylock`, `xwayland-satellite`, `wireplumber`

### Phase 3: Dev Environment

Create `profiles/thinkpad-dev.ts`.

Candidates:

- done: `nodejs`, `bun`, `distrobox`, `stylua`, `ruff`, `rust-analyzer`, `markdown-oxide`
- next: Node/Bun package-helper fix for npm-distributed tools, then `typescript-language-server`, `pyright`, and `prettierd`
- next source-built candidate: `lua-language-server`
- Neovim binary first, then plugin/runtime story later

Nixvim should remain in Nix until Hod has either a native Neovim plugin packaging story or a clean way to let Hod provide only the `nvim` binary while Home Manager provides config/plugins.

### Phase 4: Vendor/Electron Apps

Only after Hod has a policy for vendor binaries, Electron, AppImage, sandboxing, and update cadence.

Backlog:

- `slack`
- `vesktop`
- `zoom-us`
- `localsend`
- `zed-editor-fhs`
- `voxtype`
- AI CLIs with frequent upstream updates

### Phase 5: Desktop Stack Reduction

This connects to `cosmic-desktop-roadmap.md`. Once a Hod-built desktop stack can boot/run in a VM, revisit replacing pieces of the compositor/session layer. Until then, Nix should own desktop sessions.

## Priority Backlog

### P0: Make The Current Workflow Trustworthy

- Keep `hod build <file.ts>` documented and covered by CLI tests.
- `hod profile copy` builds, copies, verifies, and activates a profile remotely.
- `~/.hod/roots/*.txt` is the default GC roots system; roots are explicit recipe-hash snapshots and GC preserves their full runtime closures.
- `hod profile pin/unpin/roots` manages profile roots; `hod profile copy --pin` pins deployed profiles on the destination.
- Profile package entries support explicit names like `{ name: "openssh", recipe: opensshRecipe }`, so profile farms have stable `pkgs/<name>` links instead of binary-name heuristics.
- Keep `scripts/hod-deploy-profile` only as a transitional wrapper while the Rust command settles.
- Add `copy-closure --from` or equivalent pull flow.
- Add profile docs for remote machines.

### P1: Create ThinkPad Profile

- `profiles/thinkpad.ts`: first-wave CLI packages already known to work (created).
- `profiles/thinkpad-gui.ts`: `alacritty`, `nautilus`, Wayland tools.
- Home Manager snippet to source `~/.hod/profiles/thinkpad/env.sh`.
- Keep Nix fallback packages for one or two iterations.

### P2: Package Gaps From ThinkPad Config

- `swaylock`
- `incus`, `virt-viewer`

### P2a: Existing Recipes To Add Before Creating New Ones

- done: `profiles/thinkpad.ts` includes `fzf`, `oh-my-posh`, `github-cli`, `python3`, and `unzip`
- done: `profiles/thinkpad-dev.ts` includes `nodejs`, `bun`, `distrobox`, and `stylua`
- done: `profiles/thinkpad-gui.ts` includes `alacritty`, `grim`, `slurp`, `wl-clipboard`, `playerctl`, `brightnessctl`, `wireplumber`, and `xwayland-satellite`; add `nautilus` only after another transfer smoke test

### P2b: New Recipe Creation Order

1. `swaylock` — useful but authentication/locking behavior means test carefully before removing Nix fallback.
2. `incus`, `virt-viewer` — defer until low-risk CLI, dev tooling, and Wayland utilities are stable.

### P3: Dev Tooling

- language servers: TypeScript, Pyright, Lua
- formatters: Prettierd
- done: Stylua, Ruff, Markdown Oxide, Rust Analyzer
- blocked: npm-distributed recipes currently fail because Hod cannot execute the Hod-packaged Bun dependency inside the build sandbox (`open interp` before the recipe script runs)
- Neovim packaging boundary: binary only vs plugins/config

### P4: GUI/Vendor Apps

- establish policy and helper layer for binary/vendor packages
- package or wrap Slack/Vesktop/Zoom only if maintenance cost is acceptable

## Immediate Next Steps

The preferred push deploy command is now:

```bash
hod profile copy profiles/thinkpad.ts --to crussell@10.10.0.10 --pin
```

It builds locally, copies each package closure, verifies copied recipe/staging
entries on the ThinkPad, and activates the remote profile only after
verification succeeds. `--pin` writes `~/.hod/roots/profile-thinkpad.txt` on the
ThinkPad so future `hod gc` preserves the profile's full runtime closure.
`scripts/hod-deploy-profile` remains available as a temporary compatibility
wrapper.

Next implementation tasks, in order:

1. Deploy and smoke test `profiles/thinkpad-dev.ts` on the ThinkPad, including `bun`, `stylua`, `ruff`, `rust-analyzer`, and `markdown-oxide`.
2. Fix build-sandbox execution of Hod-packaged Bun or switch to a Node/npm packaging path before enabling `typescript-language-server`, `pyright`, and `prettierd` recipes in the profile.
3. Package `lua-language-server` from source as the next non-npm dev-tooling candidate.
4. Smoke test `profiles/thinkpad-gui.ts` transfer before removing Nix fallbacks for `wireplumber` CLI or `xwayland-satellite`.
5. Add `copy-closure --from` or equivalent pull workflow for ThinkPad-initiated deploys.
