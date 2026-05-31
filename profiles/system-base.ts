//! System base profile — Hod layer baked into the derived bootc image.
//!
//! The Fedora bootc base provides: kernel, systemd, glibc, base userland,
//! networking, SSH, ostree/bootc.
//!
//! This profile adds modern CLI/userland that the base does not ship and
//! that we want Hod-managed versions of. It is the system profile used by
//! `scripts/hod-fedora-bootc-build` to produce the derived image.

import { batRecipe } from "../recipes/native/rust/bat/bat.js";
import { curlRecipe } from "../recipes/native/curl/curl.js";
import { ezaRecipe } from "../recipes/native/rust/eza/eza.js";
import { fdRecipe } from "../recipes/native/rust/fd/fd.js";
import { fileRecipe } from "../recipes/native/file/file.js";
import { fzfRecipe } from "../recipes/native/fzf/fzf.js";
import { gitRecipe } from "../recipes/native/git/git.js";
import { hodHeartbeatRecipe } from "../recipes/native/hod-heartbeat/hod-heartbeat.js";
import { htopRecipe } from "../recipes/native/htop/htop.js";
import { jqRecipe } from "../recipes/native/jq/jq.js";
import { lessRecipe } from "../recipes/native/less/less.js";
import { ncduRecipe } from "../recipes/native/ncdu/ncdu.js";
import { pvRecipe } from "../recipes/native/pv/pv.js";
import { ripgrepRecipe } from "../recipes/native/rust/ripgrep/ripgrep.js";
import { rsyncRecipe } from "../recipes/native/rsync/rsync.js";
import { straceRecipe } from "../recipes/native/strace/strace.js";
import { treeRecipe } from "../recipes/native/tree/tree.js";
import { unzipRecipe } from "../recipes/native/unzip/unzip.js";
import { wgetRecipe } from "../recipes/native/wget/wget.js";
import { yaziRecipe } from "../recipes/native/rust/yazi/yazi.js";
import { zoxideRecipe } from "../recipes/native/rust/zoxide/zoxide.js";

export const profile = {
  name: "system-base",
  packages: [
    { name: "bat", recipe: batRecipe },
    { name: "curl", recipe: curlRecipe },
    { name: "eza", recipe: ezaRecipe },
    { name: "fd", recipe: fdRecipe },
    { name: "file", recipe: fileRecipe },
    { name: "fzf", recipe: fzfRecipe },
    { name: "git", recipe: gitRecipe },
    { name: "hod-heartbeat", recipe: hodHeartbeatRecipe },
    { name: "htop", recipe: htopRecipe },
    { name: "jq", recipe: jqRecipe },
    { name: "less", recipe: lessRecipe },
    { name: "ncdu", recipe: ncduRecipe },
    { name: "pv", recipe: pvRecipe },
    { name: "ripgrep", recipe: ripgrepRecipe },
    { name: "rsync", recipe: rsyncRecipe },
    { name: "strace", recipe: straceRecipe },
    { name: "tree", recipe: treeRecipe },
    { name: "unzip", recipe: unzipRecipe },
    { name: "wget", recipe: wgetRecipe },
    { name: "yazi", recipe: yaziRecipe },
    { name: "zoxide", recipe: zoxideRecipe },
  ],
};
