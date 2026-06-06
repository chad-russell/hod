import { defineSystem } from "hod-sdk";
import { niri } from "../recipes/native/niri/niri";
import { alacritty } from "../recipes/native/alacritty/alacritty";
import { fuzzel } from "../recipes/native/fuzzel/fuzzel";
import { pipewire } from "../recipes/native/pipewire/pipewire";
import { wireplumber } from "../recipes/native/wireplumber/wireplumber";
import { makoNotify } from "../recipes/native/mako-notify/mako-notify";
import { curl } from "../recipes/native/curl/curl";
import { git } from "../recipes/native/git/git";
import { bat } from "../recipes/native/bat/bat";
import { fd } from "../recipes/native/fd/fd";
import { ripgrep } from "../recipes/native/ripgrep/ripgrep";
import { jq } from "../recipes/native/jq/jq";
import { htop } from "../recipes/native/htop/htop";
import { eza } from "../recipes/native/eza/eza";
import { fzf } from "../recipes/native/fzf/fzf";
import { yazi } from "../recipes/native/yazi/yazi";
import { zoxide } from "../recipes/native/zoxide/zoxide";
import { less } from "../recipes/native/less/less";
import { tree } from "../recipes/native/tree/tree";
import { ncdu } from "../recipes/native/ncdu/ncdu";
import { pv } from "../recipes/native/pv/pv";
import { rsync } from "../recipes/native/rsync/rsync";
import { strace } from "../recipes/native/strace/strace";
import { unzip } from "../recipes/native/unzip/unzip";
import { wget } from "../recipes/native/wget/wget";
import { file } from "../recipes/native/file/file";
import { hodHeartbeat } from "../recipes/native/hod-heartbeat/hod-heartbeat";

export default defineSystem({
  hostname: "hod-vm",
  timezone: "America/Los_Angeles",
  locale: "en_US.UTF-8",
  kernel: "arch",

  packages: [
    niri,
    alacritty,
    fuzzel,
    pipewire,
    wireplumber,
    makoNotify,
    curl,
    git,
    bat,
    fd,
    ripgrep,
    jq,
    htop,
    eza,
    fzf,
    yazi,
    zoxide,
    less,
    tree,
    ncdu,
    pv,
    rsync,
    strace,
    unzip,
    wget,
    file,
    hodHeartbeat,
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
      "pipewire",
      "wireplumber",
      "hod-heartbeat",
    ],
  },

  boot: {
    kernelArgs: ["quiet", "loglevel=3"],
  },
});
