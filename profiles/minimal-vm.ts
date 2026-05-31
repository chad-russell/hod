//! Minimal VM profile — first Hod-owned userland for a tiny bootable VM.
//!
//! Keep this profile focused on CLI/userland packages that are useful from a
//! serial console or SSH session. The base VM should own boot, init, device
//! setup, networking, and a recovery shell; this profile is the first layer
//! above that boundary.

import { bashRecipe } from "../recipes/native/bash.js";
import { batRecipe } from "../recipes/native/rust/bat/bat.js";
import { coreutilsRecipe } from "../recipes/native/coreutils.js";
import { curlRecipe } from "../recipes/native/curl/curl.js";
import { ezaRecipe } from "../recipes/native/rust/eza/eza.js";
import { fdRecipe } from "../recipes/native/rust/fd/fd.js";
import { fileRecipe } from "../recipes/native/file/file.js";
import { fzfRecipe } from "../recipes/native/fzf/fzf.js";
import { gawkRecipe } from "../recipes/native/gawk.js";
import { gitRecipe } from "../recipes/native/git/git.js";
import { grepRecipe } from "../recipes/native/grep.js";
import { htopRecipe } from "../recipes/native/htop/htop.js";
import { jqRecipe } from "../recipes/native/jq/jq.js";
import { lessRecipe } from "../recipes/native/less/less.js";
import { ncduRecipe } from "../recipes/native/ncdu/ncdu.js";
import { opensshRecipe } from "../recipes/native/openssh/openssh.js";
import { pvRecipe } from "../recipes/native/pv/pv.js";
import { ripgrepRecipe } from "../recipes/native/rust/ripgrep/ripgrep.js";
import { rsyncRecipe } from "../recipes/native/rsync/rsync.js";
import { sedRecipe } from "../recipes/native/sed.js";
import { straceRecipe } from "../recipes/native/strace/strace.js";
import { treeRecipe } from "../recipes/native/tree/tree.js";
import { unzipRecipe } from "../recipes/native/unzip/unzip.js";
import { wgetRecipe } from "../recipes/native/wget/wget.js";
import { yaziRecipe } from "../recipes/native/rust/yazi/yazi.js";
import { zoxideRecipe } from "../recipes/native/rust/zoxide/zoxide.js";

export const profile = {
  name: "minimal-vm",
  packages: [
    { name: "bash", recipe: bashRecipe },
    { name: "bat", recipe: batRecipe },
    { name: "coreutils", recipe: coreutilsRecipe },
    { name: "curl", recipe: curlRecipe },
    { name: "eza", recipe: ezaRecipe },
    { name: "fd", recipe: fdRecipe },
    { name: "file", recipe: fileRecipe },
    { name: "fzf", recipe: fzfRecipe },
    { name: "gawk", recipe: gawkRecipe },
    { name: "git", recipe: gitRecipe },
    { name: "grep", recipe: grepRecipe },
    { name: "htop", recipe: htopRecipe },
    { name: "jq", recipe: jqRecipe },
    { name: "less", recipe: lessRecipe },
    { name: "ncdu", recipe: ncduRecipe },
    { name: "openssh", recipe: opensshRecipe },
    { name: "pv", recipe: pvRecipe },
    { name: "ripgrep", recipe: ripgrepRecipe },
    { name: "rsync", recipe: rsyncRecipe },
    { name: "sed", recipe: sedRecipe },
    { name: "strace", recipe: straceRecipe },
    { name: "tree", recipe: treeRecipe },
    { name: "unzip", recipe: unzipRecipe },
    { name: "wget", recipe: wgetRecipe },
    { name: "yazi", recipe: yaziRecipe },
    { name: "zoxide", recipe: zoxideRecipe },
  ],
};
