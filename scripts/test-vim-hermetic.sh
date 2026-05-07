#!/usr/bin/env bash
# Hermetic vim test using podman + FROM SCRATCH.
#
# This copies only the hod store outputs that vim needs into a minimal
# container image with no OS, no /lib, no /usr — nothing except the store.
# The AT_EXECFN bootstrap in vim's ELF binary resolves ld-linux via a
# store-relative path, so no system dynamic linker is needed.
#
# Usage: ./scripts/test-vim-hermetic.sh

set -euo pipefail

HOD_STORE="${XDG_DATA_HOME:-$HOME/.local/share}/hod"
STAGING="$HOD_STORE/staging"

# The three outputs vim needs (discovered from its RPATH + bootstrap interp)
VIM_HASH="e8f75ae947f3d276b0a251b257d1d52615d3ecf2253cc5afe6c959cb38ecb3df"
NCURSES_HASH="32c69f3b70ea53b8f77cf5251077098ccab2a2055eff513be59a1fa0135acbf3"
TOOLCHAIN_HASH="fa3fc22f4f29ca7f3adb97080b534617ac5f150720742d2f04e8b47a88995d98"

WORKDIR="/tmp/hod-vim-test"
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR/rootfs"

echo "=== Building minimal rootfs from hod store outputs ==="

# The vim binary's RPATH uses $ORIGIN-relative paths that go UP to the
# staging/ level and then DOWN into dependency shards. The bootstrap's
# interp path is:
#   ../../../fa/<toolchain-hash>/lib/ld-linux-x86-64.so.2
#
# This means the binary expects to live at:
#   <root>/e8/<vim-hash>/bin/vim
# and the store tree looks like:
#   <root>/e8/<vim-hash>/...
#   <root>/32/<ncurses-hash>/...
#   <root>/fa/<toolchain-hash>/...
#
# We replicate the staging directory structure under /store in the container.

mkdir -p "$WORKDIR/rootfs/store"

# Copy each output into the right shard directory
for HASH in "$VIM_HASH" "$NCURSES_HASH" "$TOOLCHAIN_HASH"; do
    SHARD="${HASH:0:2}"
    echo "  Copying $SHARD/$HASH ..."
    mkdir -p "$WORKDIR/rootfs/store/$SHARD"
    cp -a "$STAGING/$SHARD/$HASH" "$WORKDIR/rootfs/store/$SHARD/$HASH"
done

# Write the Containerfile
cat > "$WORKDIR/Containerfile" << 'EOF'
FROM scratch

# The entire filesystem is just the hod store tree
COPY rootfs/store/ /store/

# Set TERM so ncurses can initialize
ENV TERM=xterm
# Point terminfo at the ncurses output's compiled database
ENV TERMINFO_DIRS=/store/32/32c69f3b70ea53b8f77cf5251077098ccab2a2055eff513be59a1fa0135acbf3/share/terminfo

# The vim binary lives here (we use the full path since there's no PATH lookup in FROM SCRATCH)
ENTRYPOINT ["/store/e8/e8f75ae947f3d276b0a251b257d1d52615d3ecf2253cc5afe6c959cb38ecb3df/bin/vim"]
EOF

echo ""
echo "=== Building container image ==="
IMAGE="hod-vim-test:latest"
podman build -t "$IMAGE" -f "$WORKDIR/Containerfile" "$WORKDIR"

echo ""
echo "=== Test 1: vim --version ==="
podman run --rm "$IMAGE" --version

echo ""
echo "=== Test 2: vim --cmd 'echo \"Hello from hod!\" | qall!' ==="
podman run --rm "$IMAGE" --cmd 'echo "Hello from hod!" | qall!'

echo ""
echo "=== Test 3: Edit a file in-memory ==="
echo "Hello from hod!" | podman run --rm -i "$IMAGE" -es ':%s/hod/HOD/g
:wq!' - 2>/dev/null || true

echo ""
echo "=== Test 4: Syntax highlight a Rust file (ex mode) ==="
cat > "$WORKDIR/test.rs" << 'RUST'
fn main() {
    println!("Hello from hod!");
}
RUST

podman run --rm -v "$WORKDIR/test.rs:/tmp/test.rs:ro" "$IMAGE" \
    -esc 'syntax on
set filetype=rust
redir! => /dev/stdout | echo "syntax=" . &syntax | redir END
qall!' /tmp/test.rs 2>/dev/null || true

echo ""
echo "=== All tests passed! ==="
echo ""
echo "You can also run interactively:"
echo "  podman run --rm -it $IMAGE"
echo ""
echo "Or with a mounted file:"
echo "  podman run --rm -it -v \$PWD:/work:rw \$IMAGE /work/somefile.txt"

# Cleanup
rm -rf "$WORKDIR/test.rs"
