//! Recipe generator — builds `.hod` binary recipe files for the example fixtures.
//!
//! Usage:
//!   cargo run --example gen-recipes
//!
//! This generates all the `.hod` files needed for the integration test examples
//! into `examples/hello-world/` and `examples/greeter/` directories.

use std::fs;
use std::path::PathBuf;

use hod::build::current_platform;
use hod::hash::{hash_to_hex, Hash};
use hod::recipe::*;

fn main() {
    println!("=== Hod Example Recipe Generator ===\n");

    gen_hello_world();
    gen_greeter();

    println!("\n=== Done! Run the examples with the shell scripts. ===");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Write a recipe to a `.hod` file. Returns (path, recipe_hash_hex).
fn write_recipe(dir: &str, name: &str, recipe: &Recipe) -> (PathBuf, String) {
    let bytes = recipe.encode();
    let hash = recipe.recipe_hash();
    let hex = hash_to_hex(&hash);
    let filename = format!("{name}.hod");
    let path = PathBuf::from(format!("examples/{dir}/{filename}"));
    fs::write(&path, &bytes).expect("failed to write recipe");
    println!("  wrote {} (hash: {}..)", path.display(), &hex[..16]);
    (path, hex)
}

/// Build a Process recipe that uses /bin/bash.
fn process_recipe(command: &str, deps: Vec<(&str, &Hash)>) -> Recipe {
    let mut deps: Vec<ProcessDependency> = deps
        .into_iter()
        .map(|(name, hash): (&str, &Hash)| ProcessDependency {
            name: name.to_string(),
            recipe_hash: *hash,
        })
        .collect();
    deps.sort_by(|a, b| a.name.cmp(&b.name));

    Recipe::Process(RecipeProcess {
        platform: current_platform(),
        command: "/bin/bash".to_string(),
        args: vec!["-c".to_string(), command.to_string()],
        env: vec![],
        dependencies: deps,
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    })
}

// ---------------------------------------------------------------------------
// Hello World
// ---------------------------------------------------------------------------

fn gen_hello_world() {
    println!("--- Hello World ---");

    // Simple hello-world: a single Process recipe that writes a greeting.
    // No dependencies needed — just uses /bin/bash from the host.
    let hello = process_recipe(
        r#"echo 'Hello from Hod!' > $OUT/hello.txt"#,
        vec![],
    );
    let (_, hello_hash) = write_recipe("hello-world", "01-hello", &hello);

    // Write metadata
    let meta = format!(
        "# Hello World Example\n\
         #\n\
         # Recipe hash:\n\
         #   hello-process: {hello_hash}\n\
         #\n\
         # Build:\n\
         #   hod build examples/hello-world/01-hello.hod\n\
         #\n\
         # Then inspect the output with:\n\
         #   hod ls-output <output-hash>\n",
    );
    fs::write("examples/hello-world/README", meta).unwrap();
    println!("  wrote examples/hello-world/README");
}

// ---------------------------------------------------------------------------
// Greeter — a C program compiled from source in the sandbox
// ---------------------------------------------------------------------------

fn gen_greeter() {
    println!("--- Greeter (C program) ---");

    // Step 1: Process recipe that writes a C source file to $OUT
    // This is the "source" recipe — it produces a file artifact (the .c file).
    let source_cmd = r#"
cat > $OUT/greeter.c << 'GREETER_EOF'
#include <stdio.h>
#include <string.h>

int main(int argc, char *argv[]) {
    if (argc > 1) {
        for (int i = 1; i < argc; i++) {
            printf("Hello, %s!\n", argv[i]);
        }
    } else {
        printf("Hello, world!\n");
    }
    printf("Built by Hod. ♥\n");
    return 0;
}
GREETER_EOF
"#;
    let source_recipe = process_recipe(source_cmd, vec![]);
    let (_, source_hash) = write_recipe("greeter", "01-greeter-source", &source_recipe);

    // Step 2: Process recipe that compiles the C source into a binary.
    // Depends on step 1's output (the .c file), mounted at /deps/source/.
    let compile_cmd = r#"
set -euo pipefail
mkdir -p "$OUT/bin"
gcc -O2 -o "$OUT/bin/greeter" /deps/source/greeter.c
"#;
    let compile_recipe = process_recipe(
        compile_cmd,
        vec![("source", &source_recipe.recipe_hash())],
    );
    let (_, compile_hash) = write_recipe("greeter", "02-greeter-compile", &compile_recipe);

    // Step 3: Process recipe that runs the compiled binary and captures output.
    // This tests that the built artifact actually works.
    let test_cmd = r#"
set -euo pipefail
/deps/greeter/bin/greeter "Hod" "World" > $OUT/greeting.txt
echo "---" >> $OUT/greeting.txt
/deps/greeter/bin/greeter >> $OUT/greeting.txt
"#;
    let test_recipe = process_recipe(
        test_cmd,
        vec![("greeter", &compile_recipe.recipe_hash())],
    );
    let (_, test_hash) = write_recipe("greeter", "03-greeter-test", &test_recipe);

    // Write metadata
    let meta = format!(
        "# Greeter Example — C program compiled from source\n\
         #\n\
         # This example exercises the full build pipeline:\n\
         #   1. Generate a C source file (Process recipe)\n\
         #   2. Compile it with gcc (Process recipe with dependency)\n\
         #   3. Run the compiled binary and capture output (Process recipe)\n\
         #\n\
         # Recipe hashes:\n\
         #   source:  {source_hash}\n\
         #   compile: {compile_hash}\n\
         #   test:    {test_hash}\n\
         #\n\
         # Build order:\n\
         #   1. hod build examples/greeter/01-greeter-source.hod\n\
         #   2. hod build examples/greeter/02-greeter-compile.hod\n\
         #   3. hod build examples/greeter/03-greeter-test.hod\n\
         #\n\
         # Then inspect:\n\
         #   hod ls-output <output-hash> --recursive --long\n",
    );
    fs::write("examples/greeter/README", meta).unwrap();
    println!("  wrote examples/greeter/README");
}
