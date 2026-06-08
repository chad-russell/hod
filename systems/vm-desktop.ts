import { defineSystem } from "hod-sdk";
import { niriRecipe } from "../recipes/native/niri/niri.js";
import { alacrittyRecipe } from "../recipes/native/alacritty/alacritty.js";
import { fuzzelRecipe } from "../recipes/native/fuzzel/fuzzel.js";
import { pipewireRecipe } from "../recipes/native/pipewire/pipewire.js";
import { wireplumberRecipe } from "../recipes/native/wireplumber/wireplumber.js";
import { makoNotifyRecipe } from "../recipes/native/mako-notify/mako-notify.js";
import { curlRecipe } from "../recipes/native/curl/curl.js";
import { gitRecipe } from "../recipes/native/git/git.js";
import { batRecipe } from "../recipes/native/rust/bat/bat.js";
import { fdRecipe } from "../recipes/native/rust/fd/fd.js";
import { ripgrepRecipe } from "../recipes/native/rust/ripgrep/ripgrep.js";
import { jqRecipe } from "../recipes/native/jq/jq.js";
import { htopRecipe } from "../recipes/native/htop/htop.js";
import { ezaRecipe } from "../recipes/native/rust/eza/eza.js";
import { fzfRecipe } from "../recipes/native/fzf/fzf.js";
import { yaziRecipe } from "../recipes/native/rust/yazi/yazi.js";
import { zoxideRecipe } from "../recipes/native/rust/zoxide/zoxide.js";
import { lessRecipe } from "../recipes/native/less/less.js";
import { treeRecipe } from "../recipes/native/tree/tree.js";
import { ncduRecipe } from "../recipes/native/ncdu/ncdu.js";
import { pvRecipe } from "../recipes/native/pv/pv.js";
import { rsyncRecipe } from "../recipes/native/rsync/rsync.js";
import { straceRecipe } from "../recipes/native/strace/strace.js";
import { unzipRecipe } from "../recipes/native/unzip/unzip.js";
import { wgetRecipe } from "../recipes/native/wget/wget.js";
import { fileRecipe } from "../recipes/native/file/file.js";
import { hodHeartbeatRecipe } from "../recipes/native/hod-heartbeat/hod-heartbeat.js";
import { xwaylandSatelliteRecipe } from "../recipes/native/xwayland-satellite/xwayland-satellite.js";

export const system = defineSystem({
  hostname: "hod-vm",
  timezone: "America/Los_Angeles",
  locale: "en_US.UTF-8",
  kernel: "arch",

  packages: [
    niriRecipe,
    alacrittyRecipe,
    fuzzelRecipe,
    pipewireRecipe,
    wireplumberRecipe,
    makoNotifyRecipe,
    xwaylandSatelliteRecipe,
    curlRecipe,
    gitRecipe,
    batRecipe,
    fdRecipe,
    ripgrepRecipe,
    jqRecipe,
    htopRecipe,
    ezaRecipe,
    fzfRecipe,
    yaziRecipe,
    zoxideRecipe,
    lessRecipe,
    treeRecipe,
    ncduRecipe,
    pvRecipe,
    rsyncRecipe,
    straceRecipe,
    unzipRecipe,
    wgetRecipe,
    fileRecipe,
    hodHeartbeatRecipe,
  ],

  users: [
    {
      name: "hod",
      uid: 1000,
      groups: ["wheel", "audio", "video", "input"],
      home: "/home/hod",
      shell: "/usr/bin/bash",
    },
  ],

  groups: [
    { name: "wheel", gid: 10 },
    { name: "audio", gid: 29 },
    { name: "video", gid: 44 },
    { name: "input", gid: 56 },
  ],

  services: {
    enable: [
      "sshd",
      "systemd-networkd",
      "systemd-resolved",
      "hod-heartbeat",
    ],
  },

  boot: {
    kernelArgs: ["quiet", "loglevel=3"],
  },
});
