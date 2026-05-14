# Plan: Transfer Hod yad Closure to Laptop

**Status:** Historical / completed  
**Current authority:** `docs/closure-transfer.md`, `plans/geany-wrapper-handoff.md`  
**Note:** The repo now has `hod copy-closure`; this file is pre-command transfer archaeology.

## Goal
Run `yad` (GTK3 dialog tool) on the ThinkPad, with builds from the remote
hod server.

## Current State
- yad + 38 transitive runtime deps built on the remote machine
- Closure total: ~912 MB in `~/.local/share/hod/staging/`
- Toolchain alone is 871 MB (554 MB gcc libexec, 141 MB sysroot, etc.)
- Actual runtime libs from toolchain: only `lib/` = 83 MB
- ELF RUNPATHs use `$ORIGIN/../../../<shard>/<hash>/lib` relative paths
  → the staging directory tree structure must be preserved exactly

## Constraints
- Remote machine has no X11 display
- ThinkPad runs NixOS
- We want something like `nix copy --to` — transfer just the closure

## Approach: rsync the staging closure + DB + hod binary

### Step 1: Generate the closure file list (on remote)

Query the DB for all output hashes in yad's runtime closure, then produce
a list of staging dirs to transfer.

```bash
# On the remote: dump all output hashes for the yad closure
STORE=~/.local/share/hod
YAD_RECIPE=90ac05822ac9d360b1e8356a3f933239b8aa25eef4f26e668fde649b8ac04383

# Get all 39 output hashes
sqlite3 $STORE/hod.db "
  SELECT output_hash FROM outputs WHERE recipe_hash IN (
    '$YAD_RECIPE',
    '9d9ec9ac60be74f5dc738d2d4ceb0dc26eaa94d5d4c6fa6590a05b76eac20071',
    '48dc7efff9620a983f382a90538b0ac722a0a600ef0892b23cd18c438e102c10',
    'aad5004bcb98a6b4854a2c6dd44a77aa6ba83729051f96ec0e58b76dd730fbe7',
    '91ee3c76e1859dd1a90d560a695c69cd716622d488f6641c1c5906e6f93a4470',
    '9a43571721c12c087d8e7981802806c0d5d16c8fdf433d180455334af58b110a',
    'a7d799128456f58769e8b511731621c01ade926f063f0679b3eab2af64981094',
    'cdf69362f50a50c536a02766aae6ff44bd2085115a05693855bbb34c740cbfa9',
    '79449077ed84f750cbe8dd1fd9991cb7121b9e282fd9428d9748077b21134bb9',
    'cecb3192afd5919068e44aef88b924ad9fc521c3d16344cec19adeaf1afb3759',
    '860bd1369073d130cff9f2abc02918c825cf82d12fb72a5f3029a7beea6423c0',
    'c81ecfb9482b9330d6561c6a1ecc06cf82ccb6ca10fc2d5176d6a49c12161fdd',
    '9993c0c0c6132b09a35cad4bde083251b45abf4885349d83f0727722a6b368a3',
    'a1bbe3735889768055a8aba1e13d48e6535edadd2aeb87e3b1c4da5cb9c6fd17',
    'a82235e4c14f9e2d20dae7cf60791a71e4d07fa000904fd33401b8a9e75a35c4',
    '72cb65cbc3db4dc921b062d1d0474a02887de940ece9e2c9209eae59d6a8f0d8',
    '391939d8f96aea070c2297ede8bb6162cb1a52fd52db4c5b5320f35e8e5610d5',
    '142ffc44371328c5cf6065bb7e145a5d50c2026f005094dc0a4ab38d98a9d8a9',
    'b1d93105d55476f8962d6a7f0832b2f8fae846b2e5bacd24cc063bda366f12dd',
    '537c7718fd38b498048c78c70f8f6c4dc5940ef604d9b15e97818eab09e8c1d1',
    '22fe19ab011fd4a73f3b0069c470bd5c5b35866cd5d4ad570fb190323069acc4',
    '911317892ca2985a8b4535cac6e8ad1a8a89c0c3c8084401aa69c974e4667256',
    '266d037bc47d0ee2375f9293c0ac9ad03be42cdbf44b4eb1ec1f825bc4e774b4',
    '8ccad931312c9d806dcb510897c5896ba3f1bc13c7c50a12d831d6bed5ea03f9',
    '796ae8f623b8c6bc0a706a05d16891061367854a3895ce88ce29b8cef47c9c84',
    'a32cbbe413b7653cec29fcd36bd9f952dff3e89b1190165d27da49a9728b5331',
    '2a28cd325f8979eab7e63482d58ed5ba58ae1a6cd594187b5ff1b42e2a88e2fa',
    '6a96a3f5c4ac6075f42e06376a1c5706cdcd896be2a90100d496a0f6cb681987',
    '017be824a249e4f7ec723bc348383ba924a43961346320dda5cb3a25e0b6ff79',
    '649b0806e2d3f2192cf5a9918d5e7ef2e65a6aa48277a851b416d181415604e4',
    'c3a2926b6d5bac7f38cb607ca0e0652de3efef0cc0a079b3a3d58df82e812fa6',
    '0895e7d62703d9b7d9d03f00cd8e6cdf2db82e4f6fb8362b6c65594d99f5d7d4',
    'e94e25c984b4a5410e9539d06f9f46e96973866a3bb0941780d51ac2161ddc4e',
    'd92c6aca924210108c24ca643e0760af273cb1cee2264bf018b960ed62da74d9',
    '0ca0f42cf6b5de7ae9e28018bd786b20385a485c2a1330050f724ec9f73d01a3',
    '6015d265845b59fb9c57e0785073f7511a95e051affde74d009ef4bf83609c5e',
    'cc7a6c868a3749fe5edbcb44c69881f8b90ecffda8fb52045aec7127e42fe1a8',
    '7058e95e15ab82db781a8b28bf44ec3c8ae7a4c600147fdb9cd47e9b6a461a4f',
    '9766489fb764515c3593a2ae1fe06593cc65446714716be268de389d08bb23b5'
  );
" > /tmp/yad-closure-outputs.txt
```

### Step 2: rsync staging dirs to laptop

```bash
# Build rsync include list from output hashes
while read hash; do
  echo "staging/${hash:0:2}/$hash/"
done < /tmp/yad-closure-outputs.txt > /tmp/yad-rsync-includes.txt

# rsync to laptop
rsync -avz --files-from=/tmp/yad-rsync-includes.txt \
  ~/.local/share/hod/ \
  thinkpad:~/.local/share/hod/
```

### Step 3: Transfer the DB (just the closure's rows)

Option A: Copy the whole DB (small — just metadata)
```bash
rsync -avz ~/.local/share/hod/hod.db thinkpad:~/.local/share/hod/
```

Option B: Extract just the closure rows and merge into existing DB
This is safer but more complex. For a first pass, just copy the whole DB.

### Step 4: Transfer the recipes

```bash
# Recipes are tiny (~2MB total). Copy them all.
rsync -avz ~/.local/share/hod/recipes/ thinkpad:~/.local/share/hod/recipes/
```

### Step 5: Install hod on the laptop

Option A: Build from source
```bash
git clone <hod-repo>
cd hod
nix develop --accept-flake-config -c cargo build --release
cp target/release/hod ~/.local/bin/
```

Option B: Just copy the binary
```bash
scp target/debug/hod thinkpad:~/.local/bin/
```

### Step 6: Run yad on the laptop

```bash
# Set DISPLAY to local X server
export DISPLAY=:0

# Run yad via hod
hod run 90ac05822ac9d360b1e8356a3f933239b8aa25eef4f26e668fde649b8ac04383 \
  -- --title="Hello Hod" --text="GTK3 from a content-addressed store!" --button=Ok:0
```

## Size Estimate

| Component | Compressed | Uncompressed |
|-----------|-----------|--------------|
| staging/ (39 outputs) | ~150-200 MB (zstd) | ~912 MB |
| hod.db | <1 MB | <1 MB |
| recipes/ | <1 MB | ~2 MB |
| hod binary | ~15 MB | ~40 MB |
| **Total** | **~170-220 MB** | **~955 MB** |

## Known Issues to Address

1. **Toolchain bloat**: 871 MB for the toolchain staging, but only 83 MB
   of `lib/` is needed at runtime. The `$ORIGIN` RUNPATHs in other binaries
   point into this staging dir, so we can't just copy `lib/`. Options:
   - Accept the bloat for now (~200 MB compressed)
   - Create a slim "runtime" variant of the toolchain with just libc/ld-linux
   - Strip the toolchain staging (remove sysroot/, include/, libexec/gcc/,
     bin/ except ld-linux)

2. **GTK runtime data**: yad/GTK3 may need at runtime:
   - `GDK_PIXBUF_MODULEDIR` (pixbuf loaders)
   - `FONTCONFIG_PATH` (font config)
   - `XDG_DATA_DIRS` (MIME types, icons)
   - `GSETTINGS_SCHEMA_DIR` (GTK settings)
   The RUNPATH handles library loading, but these data-file paths aren't
   in the ELF. `hod run` sets `XDG_DATA_DIRS` from `share/` if present,
   but may need additional env vars for the full GTK experience.

3. **DISPLAY passthrough**: `hod run` inherits the process environment,
   so `DISPLAY=:0` set before `hod run` should work. The roadmap's Phase 3
   mentions proper display var passthrough, but for a test this is fine.

## Alternative: Write a `hod copy-closure` CLI command

For the longer term, we could add a proper CLI command:

```
hod copy-closure <recipe-hash> --to=user@host
```

That:
1. Queries the DB for the transitive closure
2. Generates the rsync file list
3. Transfers staging dirs + DB rows + recipe files
4. Verifies the remote store is consistent

This would be the Nix `nix copy --to` equivalent.
