//! ThinkPad profile — first-wave daily CLI packages.
//!
//! This profile is the first step toward moving userland packages out of the
//! ThinkPad's Nix/Home Manager package lists and into Hod-managed profiles.
//! NixOS should still own system services, desktop sessions, secrets, fonts,
//! and fallback recovery tooling.
//!
//! Keep this profile focused on daily CLI packages. GUI and heavier dev runtime
//! packages live in follow-up profiles so failures are easy to localize.

import { batRecipe } from "../recipes/native/rust/bat/bat.js";
import { curlRecipe } from "../recipes/native/curl/curl.js";
import { ezaRecipe } from "../recipes/native/rust/eza/eza.js";
import { fdRecipe } from "../recipes/native/rust/fd/fd.js";
import { fileRecipe } from "../recipes/native/file/file.js";
import { fzfRecipe } from "../recipes/native/fzf/fzf.js";
import { gitRecipe } from "../recipes/native/git/git.js";
import { githubCliRecipe } from "../recipes/native/github-cli/github-cli.js";
import { htopRecipe } from "../recipes/native/htop/htop.js";
import { jqRecipe } from "../recipes/native/jq/jq.js";
import { lessRecipe } from "../recipes/native/less/less.js";
import { ncduRecipe } from "../recipes/native/ncdu/ncdu.js";
import { ohMyPoshRecipe } from "../recipes/native/oh-my-posh/oh-my-posh.js";
import { opensshRecipe } from "../recipes/native/openssh/openssh.js";
import { pvRecipe } from "../recipes/native/pv/pv.js";
import { pythonRecipe } from "../recipes/native/python/python.js";
import { ripgrepRecipe } from "../recipes/native/rust/ripgrep/ripgrep.js";
import { rsyncRecipe } from "../recipes/native/rsync/rsync.js";
import { straceRecipe } from "../recipes/native/strace/strace.js";
import { treeRecipe } from "../recipes/native/tree/tree.js";
import { unzipRecipe } from "../recipes/native/unzip/unzip.js";
import { wgetRecipe } from "../recipes/native/wget/wget.js";
import { yaziRecipe } from "../recipes/native/rust/yazi/yazi.js";
import { zoxideRecipe } from "../recipes/native/rust/zoxide/zoxide.js";
import { nodejsRecipe } from "../recipes/native/nodejs/nodejs.js";
import { bunRecipe } from "../recipes/native/bun/bun.js";
import { lazygitRecipe } from "../recipes/native/lazygit/lazygit.js";
import { tigRecipe } from "../recipes/native/tig/tig.js";
import { tmuxRecipe } from "../recipes/native/tmux/tmux.js";
import { vimRecipe } from "../recipes/native/vim/vim.js";
import { nanoRecipe } from "../recipes/native/nano/nano.js";
import { wlClipboardRecipe } from "../recipes/native/wl-clipboard/wl-clipboard.js";
import { distroboxRecipe } from "../recipes/native/distrobox/distrobox.js";
import { lsofRecipe } from "../recipes/native/lsof/lsof.js";
import { resticRecipe } from "../recipes/native/restic/restic.js";
import { ageRecipe } from "../recipes/native/age/age.js";
import { gnupgRecipe } from "../recipes/native/gnupg/gnupg.js";
import { goRecipe } from "../recipes/native/go/go.js";
import { rustRecipe } from "../recipes/native/rust/rust.js";
import { brightnessctlRecipe } from "../recipes/native/brightnessctl/brightnessctl.js";
import { playerctlRecipe } from "../recipes/native/playerctl/playerctl.js";
import { podmanRecipe } from "../recipes/native/podman/podman.js";
import { crunRecipe } from "../recipes/native/crun/crun.js";
import { conmonRecipe } from "../recipes/native/conmon/conmon.js";
import { passtRecipe } from "../recipes/native/passt/passt.js";
import { netavarkRecipe } from "../recipes/native/netavark/netavark.js";
import { aardvarkDnsRecipe } from "../recipes/native/aardvark-dns/aardvark-dns.js";
import { containersConfigRecipe } from "../recipes/native/containers-config/containers-config.js";
import { ghosttyRecipe } from "../recipes/native/ghostty/ghostty.js";
import { zshSyntaxHighlightingRecipe } from "../recipes/native/zsh-syntax-highlighting/zsh-syntax-highlighting.js";
import { userUnit } from "../js/src/systemd.js";
import { sourceFile } from "../js/src/profile-files.js";

const pk = (name: string, subpath: string = "") => {
  const suffix = subpath === "" ? "" : `/${subpath}`;
  return `%h/.hod/profiles/thinkpad/pkgs/${name}${suffix}`;
};

const systemdEnvFile = "%h/.hod/profiles/thinkpad/env.systemd";

const userUnits = [
  userUnit("voxtype", {
    Unit: {
      Description: "Voxtype push-to-talk voice-to-text daemon",
      PartOf: ["graphical-session.target"],
      After: ["graphical-session.target", "pipewire.service", "pipewire-pulse.service"],
    },
    Service: {
      EnvironmentFile: systemdEnvFile,
      Type: "simple",
      ExecStart: "%h/.nix-profile/bin/voxtype -q daemon",
      Restart: "on-failure",
      RestartSec: 5,
    },
    Install: {
      WantedBy: ["graphical-session.target"],
    },
  }),
  userUnit("gloo-tunnel", {
    Unit: {
      Description: "SSH tunnel: Gloo ports -> bee",
    },
    Service: {
      EnvironmentFile: systemdEnvFile,
      ExecStart:
        `${pk("openssh", "bin/ssh")} -N -o ExitOnForwardFailure=yes` +
        " -L 3000:127.0.0.1:3000" +
        " -L 3001:127.0.0.1:3001" +
        " -L 3006:127.0.0.1:3006" +
        " -L 8000:127.0.0.1:8000" +
        " bee",
      RestartSec: 5,
    },
  }),
  userUnit("opencode-web", {
    Unit: {
      Description: "OpenCode Web Interface",
    },
    Service: {
      EnvironmentFile: systemdEnvFile,
      Type: "simple",
      ExecStart: "/run/current-system/sw/bin/opencode web --port 4096",
      WorkingDirectory: "%h",
      Restart: "on-failure",
      RestartSec: 5,
    },
  }),
];

const configFiles = [
  sourceFile(".config/ghostty/config", "../configs/thinkpad/ghostty/config", import.meta.url),
  sourceFile(".config/gtk-3.0/settings.ini", "../configs/thinkpad/gtk/settings-gtk3.ini", import.meta.url),
  sourceFile(".config/gtk-4.0/settings.ini", "../configs/thinkpad/gtk/settings-gtk4.ini", import.meta.url),
  sourceFile(".config/mimeapps.list", "../configs/thinkpad/mimeapps.list", import.meta.url),
  sourceFile(".config/niri/config.kdl", "../configs/thinkpad/niri/config.kdl", import.meta.url),
  sourceFile(".config/oh-my-posh/config.json", "../configs/thinkpad/oh-my-posh/config.json", import.meta.url),
  sourceFile(".config/ssh/config", "../configs/thinkpad/ssh/config", import.meta.url),
  sourceFile(".config/zellij/config.kdl", "../configs/thinkpad/zellij/config.kdl", import.meta.url),
  sourceFile(".config/zsh/fzf-history-widget.zsh", "../configs/thinkpad/zsh/fzf-history-widget.zsh", import.meta.url),
  sourceFile(".config/zsh/plugins/zsh-autosuggestions.zsh", "../configs/thinkpad/zsh/plugins/zsh-autosuggestions.zsh", import.meta.url),

  sourceFile(".pi/agent/extensions/searxng-search/index.ts", "../configs/thinkpad/pi-extensions/searxng-search/index.ts", import.meta.url),
  sourceFile(".pi/agent/extensions/gloo-proxy/index.ts", "../configs/thinkpad/pi-extensions/gloo-proxy/index.ts", import.meta.url),
  sourceFile(".zshenv", "../configs/thinkpad/zsh/zshenv", import.meta.url),
  sourceFile(".zprofile", "../configs/thinkpad/zsh/zprofile", import.meta.url),
  sourceFile(".zshrc", "../configs/thinkpad/zsh/zshrc", import.meta.url),
];

export const profile = {
  name: "thinkpad",
  user_units: userUnits,
  files: configFiles,
  packages: [
    // Daily CLI tools already present in the ThinkPad Home Manager config.
    { name: "bat", recipe: batRecipe },
    { name: "eza", recipe: ezaRecipe },
    { name: "fd", recipe: fdRecipe },
    { name: "fzf", recipe: fzfRecipe },
    { name: "git", recipe: gitRecipe },
    { name: "github-cli", recipe: githubCliRecipe },
    { name: "jq", recipe: jqRecipe },
    { name: "oh-my-posh", recipe: ohMyPoshRecipe },
    { name: "ripgrep", recipe: ripgrepRecipe },
    { name: "wget", recipe: wgetRecipe },
    { name: "yazi", recipe: yaziRecipe },
    { name: "zoxide", recipe: zoxideRecipe },

    // Recovery/debug utilities. Keep Nix fallbacks during early migration.
    { name: "curl", recipe: curlRecipe },
    { name: "file", recipe: fileRecipe },
    { name: "htop", recipe: htopRecipe },
    { name: "less", recipe: lessRecipe },
    { name: "ncdu", recipe: ncduRecipe },
    { name: "openssh", recipe: opensshRecipe },
    { name: "pv", recipe: pvRecipe },
    { name: "python", recipe: pythonRecipe },
    { name: "rsync", recipe: rsyncRecipe },
    { name: "strace", recipe: straceRecipe },
    { name: "tree", recipe: treeRecipe },
    { name: "unzip", recipe: unzipRecipe },

    // Dev runtimes and editors.
    { name: "nodejs", recipe: nodejsRecipe },
    { name: "bun", recipe: bunRecipe },
    { name: "lazygit", recipe: lazygitRecipe },
    { name: "tig", recipe: tigRecipe },
    { name: "tmux", recipe: tmuxRecipe },
    { name: "vim", recipe: vimRecipe },
    { name: "nano", recipe: nanoRecipe },
    { name: "wl-clipboard", recipe: wlClipboardRecipe },
    { name: "distrobox", recipe: distroboxRecipe },
    { name: "lsof", recipe: lsofRecipe },

    // Dev toolchains.
    { name: "go", recipe: goRecipe },
    { name: "rust", recipe: rustRecipe },

    // Security / encryption.
    { name: "age", recipe: ageRecipe },
    { name: "gnupg", recipe: gnupgRecipe },

    // Backup.
    { name: "restic", recipe: resticRecipe },

    // Wayland CLI utilities (need D-Bus/session bus at runtime).
    { name: "brightnessctl", recipe: brightnessctlRecipe },
    { name: "playerctl", recipe: playerctlRecipe },

    // GUI applications.
    { name: "ghostty", recipe: ghosttyRecipe },

    // Zsh plugins.
    { name: "zsh-syntax-highlighting", recipe: zshSyntaxHighlightingRecipe },

    // Container stack (rootless podman + distrobox).
    { name: "containers-config", recipe: containersConfigRecipe },
    { name: "crun", recipe: crunRecipe },
    { name: "conmon", recipe: conmonRecipe },
    { name: "passt", recipe: passtRecipe },
    { name: "netavark", recipe: netavarkRecipe },
    { name: "aardvark-dns", recipe: aardvarkDnsRecipe },
    { name: "podman", recipe: podmanRecipe },
  ],
};
