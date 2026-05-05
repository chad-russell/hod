#!/usr/bin/env bash
# debug-sandbox.sh — Enter a preserved hod build sandbox for interactive debugging.
#
# Usage:
#   scripts/debug-sandbox.sh                          # Enter latest sandbox
#   scripts/debug-sandbox.sh recipes/gcc/02-gcc.json  # Also source env vars from recipe
#   scripts/debug-sandbox.sh --sandbox DIR [recipe]   # Enter a specific sandbox
#
# The sandbox must have been preserved via: hod build ... --keep-failed
# Requires: jq (for recipe JSON parsing)

set -euo pipefail

STORE_DIR="${HOD_STORE:-$HOME/.local/share/hod}"
SANDBOX=""
RECIPE_JSON=""

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --sandbox)
            SANDBOX="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--sandbox DIR] [recipe.json]"
            echo ""
            echo "Enters a preserved hod build sandbox for interactive debugging."
            echo "If no --sandbox is given, uses the most recently modified one."
            echo "If a recipe JSON is given, exports its env vars inside the sandbox."
            exit 0
            ;;
        *)
            RECIPE_JSON="$1"
            shift
            ;;
    esac
done

# Find the latest sandbox if not specified
if [[ -z "$SANDBOX" ]]; then
    SANDBOX=$(ls -td "$STORE_DIR"/tmp/sandbox-* 2>/dev/null | head -1)
    if [[ -z "$SANDBOX" ]]; then
        echo "ERROR: No sandbox directories found in $STORE_DIR/tmp/"
        echo "Run a build with --keep-failed first."
        exit 1
    fi
fi

if [[ ! -d "$SANDBOX" ]]; then
    echo "ERROR: Sandbox not found: $SANDBOX"
    exit 1
fi

echo "Entering sandbox: $SANDBOX"

# Create /dev/null if missing (many tools need it)
if [[ ! -c "$SANDBOX/dev/null" ]]; then
    sudo mkdir -p "$SANDBOX/dev"
    sudo mknod -m 666 "$SANDBOX/dev/null" c 1 3 2>/dev/null || true
fi

# Ensure /tmp and /homeless-shelter exist
mkdir -p "$SANDBOX/tmp" "$SANDBOX/homeless-shelter"

# Build the env var setup
ENV_SETUP="export OUT=/out
export DEPS=/deps
export TMPDIR=/tmp
export HOME=/homeless-shelter"

# Extract env vars from recipe JSON if provided
if [[ -n "$RECIPE_JSON" && -f "$RECIPE_JSON" ]]; then
    if command -v jq &>/dev/null; then
        RECIPE_ENV=$(jq -r '.env[] | "export " + .key + "='"'"'" + .value + "'"'"'"' "$RECIPE_JSON")
        ENV_SETUP="$RECIPE_ENV
$ENV_SETUP"
    else
        echo "WARNING: jq not found, recipe env vars not set (install jq or set them manually)"
        echo "TIP: Set vars manually: export CC=/deps/seed/bin/gcc etc."
    fi
else
    echo "TIP: Pass a recipe.json as argument to auto-set env vars"
fi

# Write a .bashrc inside the sandbox for auto-setup
cat > "$SANDBOX/homeless-shelter/.bashrc" << 'BASHRC_HEADER'
# Hod debug sandbox — auto-generated
echo ""
echo "=== Hod Debug Sandbox ==="
echo "Deps:     /deps/<name>/"
echo "Output:   \$OUT (/out/)"
echo "Source:   (look in / for extracted source dirs)"
echo ""
echo "Common commands:"
echo "  cd /gcc-*/build && make -j2     # Resume gcc build"
echo "  cd /gcc-*/build && make install  # Test install step"
echo ""
BASHRC_HEADER

echo "$ENV_SETUP" >> "$SANDBOX/homeless-shelter/.bashrc"

cat >> "$SANDBOX/homeless-shelter/.bashrc" << 'BASHRC_FOOTER'

# Try to cd to a build directory if one exists
for build_dir in /gcc-*/build /*/build; do
    if [[ -d "$build_dir" ]]; then
        cd "$build_dir"
        echo "Auto-cd'd to $build_dir"
        break
    fi
done

BASHRC_FOOTER

# Enter the sandbox
echo "Starting interactive shell (Ctrl+D or exit to leave)..."
echo ""
sudo chroot "$SANDBOX" /bin/bash --rcfile /homeless-shelter/.bashrc -i
