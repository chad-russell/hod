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

export const profile = {
  name: "thinkpad",
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
  ],
};
