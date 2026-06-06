#!/bin/bash
export LD_LIBRARY_PATH="/nix/store/awqy7a9vqrcmdw6qqwvn434i1v66zxck-libseccomp-2.6.0-lib/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec /tmp/mkosi-venv/bin/mkosi "$@"
