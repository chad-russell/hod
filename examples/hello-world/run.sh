#!/usr/bin/env bash
# Hello World — integration test for Hod
#
# This script builds a "hello world" recipe using the Hod CLI.
# It exercises: Process recipe → ls-output → content verification.
#
# The recipe simply runs: echo 'Hello from Hod!' > $OUT/hello.txt

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOD="$PROJECT_DIR/target/release/hod"

# Use a dedicated store for this example (clean state)
STORE="/tmp/hod-hello-world-store"
rm -rf "$STORE"

echo "=== Hod Hello World Integration Test ==="
echo ""

# Build the project if needed
if [ ! -x "$HOD" ]; then
    echo "Building hod..."
    cargo build --release --manifest-path "$PROJECT_DIR/Cargo.toml"
fi

# Step 1: Build the hello-world process recipe
echo "Step 1: Building hello-world (Process recipe)..."
OUTPUT=$("$HOD" build "$SCRIPT_DIR/01-hello.hod" --store "$STORE")
echo "  output hash: $OUTPUT"
echo ""

# Step 2: Inspect the output directory
echo "Step 2: Inspecting the output..."
"$HOD" ls-output "$OUTPUT" --store "$STORE" --recursive --long
echo ""

# Step 3: Show the actual content
echo "Step 3: Reading hello.txt..."
OUTPUT_DIR="$STORE/staging/${OUTPUT:0:2}/$OUTPUT"
if [ -d "$OUTPUT_DIR" ]; then
    cat "$OUTPUT_DIR/hello.txt"
else
    echo "  (output is not a directory, reading as file)"
    cat "$OUTPUT_DIR"
fi
echo ""

echo "=== Hello World test complete! ==="
