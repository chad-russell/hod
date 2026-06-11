# Ghostty Notes

Ghostty 1.3.1 builds and runs locally from a Hod closure copied from the
remote builder `bees`.

## Working Build

- Recipe root: `recipes/native/ghostty/ghostty.ts`
- Zig toolchain: `recipes/native/zig/zig.ts` using upstream Zig 0.15.2
- Build command used during validation:

```bash
hod build recipes/native/ghostty/ghostty.ts --force --keep-failed
```

- Pull command used from the ThinkPad:

```bash
hod copy-closure <ghostty-recipe-hash> --from bees --remote-hod /home/crussell/Code/hod/target/debug/hod --force
```

## Important Runtime Details

- Ghostty is a GTK4/libadwaita application and relies on Hod-managed GTK,
  Wayland, X11, Mesa, fontconfig, and schema/data closures.
- `libXcomposite` and `libXtst` are explicit Ghostty dependencies so closure
  resolution is complete from the Ghostty root, not only via transitive GTK deps.
- `GHOSTTY_RESOURCES_DIR` should point at `$prefix/share/ghostty` so shell
  integration and resources do not fall back to any host or Nix Ghostty install.
- The wrapper must not leak Hod `LD_LIBRARY_PATH` to Ghostty's child shell.
  If it does, host/Nix shell tooling can load Nix libraries against Hod glibc
  and fail with errors like `GLIBC_2.42 not found`.

## Relocation/Wrapper Lessons

- Generate wrappers before relocation. Relocation embeds executable-relative
  interpreter/bootstrap paths, so it must see the final layout under
  `bin/_hod_wrapped/`.
- Ghostty's main ELF currently has no spare program-header slot for Hod's
  RUNPATH/interpreter `PT_LOAD` extension path. When that patch fails, Hod must
  skip bootstrap injection rather than producing a half-relocated executable.
- For Ghostty's unpatched ELF, the wrapper invokes Hod's dynamic linker with an
  explicit `--library-path` for Ghostty itself. This keeps Hod libraries scoped
  to Ghostty startup and avoids exporting them to spawned terminal commands.

## Remaining Cleanup

- The Ghostty recipe still has build-time workarounds for Zig native helper
  compilation and pkg-config metadata. Prefer reducing those once Hod has a
  cleaner Zig/C build environment story.
- The recipe still uses `unsafe_flags: 0x01`; remove this if all Zig build
  inputs become fully pinned and available from Hod recipes.
