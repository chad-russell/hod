#!/usr/bin/env bash
# Greeter — integration test for Hod
#
# This script builds a C program from source using the Hod CLI.
# It exercises the full pipeline:
#   1. Process recipe → generates C source code
#   2. Process recipe → compiles with gcc (depends on #1)
#   3. Process recipe → runs the binary and captures output (depends on #2)
#
# Prerequisites: gcc must be available on the system (for step 2).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOD="$PROJECT_DIR/target/release/hod"

# Use a dedicated store for this example (clean state)
STORE="/tmp/hod-greeter-store"
rm -rf "$STORE"

echo "=== Hod Greeter (C Program) Integration Test ==="
echo ""

# Build the project if needed
if [ ! -x "$HOD" ]; then
    echo "Building hod..."
    cargo build --release --manifest-path "$PROJECT_DIR/Cargo.toml"
fi

# Step 1: Generate the C source
echo "Step 1: Generating C source..."
SOURCE_OUTPUT=$("$HOD" build "$SCRIPT_DIR/01-greeter-source.hod" --store "$STORE")
echo "  output hash: $SOURCE_OUTPUT"
echo ""

# Step 2: Compile the C program
echo "Step 2: Compiling greeter with gcc..."
BUILD_OUTPUT=$("$HOD" build "$SCRIPT_DIR/02-greeter-compile.hod" --store "$STORE" --quiet)
echo "  output hash: $BUILD_OUTPUT"
echo ""

# Step 3: Run the compiled binary and capture output
echo "Step 3: Testing the compiled binary..."
TEST_OUTPUT=$("$HOD" build "$SCRIPT_DIR/03-greeter-test.hod" --store "$STORE")
echo "  output hash: $TEST_OUTPUT"
echo ""

# Step 4: Show the test output
echo "Step 4: Greeting output:"
echo ""
"$HOD" ls-output "$TEST_OUTPUT" --store "$STORE" --recursive --long
echo ""

RESULT_FILE="$STORE/staging/${TEST_OUTPUT:0:2}/$TEST_OUTPUT/greeting.txt"
if [ -f "$RESULT_FILE" ]; then
    echo "--- greeting.txt ---"
    cat "$RESULT_FILE"
    echo "--- end ---"
    echo ""
fi

# Step 5: Show the compiled binary info
echo "Step 5: Compiled binary details:"
BIN_PATH="$STORE/staging/${BUILD_OUTPUT:0:2}/$BUILD_OUTPUT/bin/greeter"
if [ -f "$BIN_PATH" ]; then
    file "$BIN_PATH"
    ls -la "$BIN_PATH"
    echo ""
    echo "Running directly from store:"
    "$BIN_PATH" "from the Hod store"
fi
echo ""

echo "=== Greeter integration test complete! ==="
