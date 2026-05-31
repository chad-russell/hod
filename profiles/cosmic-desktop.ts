//! COSMIC desktop profile for Hod OS.
//!
//! Full COSMIC desktop environment (compositor, session, panel, apps)
//! plus a base set of CLI tools. All COSMIC components are built from
//! source via the shared cosmicApp() helper in recipes/helpers/cosmic.ts.

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

import { cosmicCompRecipe } from "../recipes/native/cosmic-comp/cosmic-comp.js";
import { cosmicSessionRecipe } from "../recipes/native/cosmic-session/cosmic-session.js";
import { cosmicPanelRecipe } from "../recipes/native/cosmic-panel/cosmic-panel.js";
import { cosmicSettingsRecipe } from "../recipes/native/cosmic-settings/cosmic-settings.js";
import { cosmicSettingsDaemonRecipe } from "../recipes/native/cosmic-settings-daemon/cosmic-settings-daemon.js";
import { cosmicFilesRecipe } from "../recipes/native/cosmic-files/cosmic-files.js";
import { cosmicEditRecipe } from "../recipes/native/cosmic-edit/cosmic-edit.js";
import { cosmicTermRecipe } from "../recipes/native/cosmic-term/cosmic-term.js";
import { cosmicLauncherRecipe } from "../recipes/native/cosmic-launcher/cosmic-launcher.js";
import { cosmicBgRecipe } from "../recipes/native/cosmic-bg/cosmic-bg.js";
import { cosmicIdleRecipe } from "../recipes/native/cosmic-idle/cosmic-idle.js";
import { cosmicRandrRecipe } from "../recipes/native/cosmic-randr/cosmic-randr.js";
import { cosmicNotificationsRecipe } from "../recipes/native/cosmic-notifications/cosmic-notifications.js";
import { cosmicOsdRecipe } from "../recipes/native/cosmic-osd/cosmic-osd.js";
import { cosmicScreenshotRecipe } from "../recipes/native/cosmic-screenshot/cosmic-screenshot.js";
import { cosmicWorkspacesEpochRecipe } from "../recipes/native/cosmic-workspaces-epoch/cosmic-workspaces-epoch.js";
import { cosmicAppletsRecipe } from "../recipes/native/cosmic-applets/cosmic-applets.js";
import { cosmicApplibraryRecipe } from "../recipes/native/cosmic-applibrary/cosmic-applibrary.js";
import { cosmicIconsRecipe } from "../recipes/native/cosmic-icons/cosmic-icons.js";
import { popLauncherRecipe } from "../recipes/native/pop-launcher/pop-launcher.js";

export const profile = {
  name: "cosmic-desktop",
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
    { name: "cosmic-comp", recipe: cosmicCompRecipe },
    { name: "cosmic-session", recipe: cosmicSessionRecipe },
    { name: "cosmic-panel", recipe: cosmicPanelRecipe },
    { name: "cosmic-settings", recipe: cosmicSettingsRecipe },
    { name: "cosmic-settings-daemon", recipe: cosmicSettingsDaemonRecipe },
    { name: "cosmic-files", recipe: cosmicFilesRecipe },
    { name: "cosmic-edit", recipe: cosmicEditRecipe },
    { name: "cosmic-term", recipe: cosmicTermRecipe },
    { name: "cosmic-launcher", recipe: cosmicLauncherRecipe },
    { name: "cosmic-bg", recipe: cosmicBgRecipe },
    { name: "cosmic-idle", recipe: cosmicIdleRecipe },
    { name: "cosmic-randr", recipe: cosmicRandrRecipe },
    { name: "cosmic-notifications", recipe: cosmicNotificationsRecipe },
    { name: "cosmic-osd", recipe: cosmicOsdRecipe },
    { name: "cosmic-screenshot", recipe: cosmicScreenshotRecipe },
    { name: "cosmic-workspaces-epoch", recipe: cosmicWorkspacesEpochRecipe },
    { name: "cosmic-applets", recipe: cosmicAppletsRecipe },
    { name: "cosmic-applibrary", recipe: cosmicApplibraryRecipe },
    { name: "cosmic-icons", recipe: cosmicIconsRecipe },
    { name: "pop-launcher", recipe: popLauncherRecipe },
  ],
};
