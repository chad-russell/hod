//! Declarative runtime metadata for Process recipes.
//!
//! Runtime metadata describes how a built output's executables are wrapped at
//! runtime, and what runtime environment an output contributes to anything that
//! runtime-depends on it. Core Hod resolves this data generically and embeds no
//! package/ecosystem knowledge — policy lives here and in recipe helpers,
//! mirroring the nixpkgs setup-hook model.
//!
//! ## Authoring levels
//!
//! Runtime metadata can be contributed at a few levels, and the pieces compose
//! by simple ordered concatenation (see `mergeRuntime`):
//!
//! 1. **Core (mechanism).** The static launcher and the generic search-path
//!    base (`XDG_DATA_DIRS`, `GSETTINGS_SCHEMA_PATH`) are applied by core Hod
//!    with no metadata at all — every wrapped output gets them.
//! 2. **Build helper (setup-hook analog).** Profile helpers (`cProfile`,
//!    `mesonProfile`, `cargoBuild`, …) wire in the launcher and may contribute
//!    shared `provides`/`wrapper` fragments common to an ecosystem.
//! 3. **Recipe (author).** A recipe declares its own `runtime: { provides,
//!    wrapper }`. Use `mergeRuntime(...)` to combine helper-supplied fragments
//!    with the recipe's own directives.
//!
//! Merging is intentionally a shallow, ordered concat (not a Nix-style
//! recursive attribute merge): the composer already resolves precedence via op
//! semantics (`set` vs `set_default`, prefix/suffix order), so concatenating
//! the `provides[]` and `wrapper[]` lists in declaration order is all we need.
//!
//! See `plans/declarative-runtime-wrappers.md`.

/** A value source for a runtime directive. Path-valued sources carry an
 *  implicit "skip if the path does not exist" guard, resolved by core. */
export type RuntimeSource =
  | { literal: string }
  | { self: string }
  | { dep: { name: string; sub: string } }
  | { first_existing: RuntimeSource[] };

/** A runtime wrapper operation. Mirrors the `makeWrapper` interface. */
export type WrapOp =
  | "set"
  | "set_default"
  | "unset"
  | "prefix"
  | "suffix"
  | "add_flags"
  | "argv0"
  | "inherit_argv0";

/** A single runtime directive. */
export interface RuntimeDirective {
  op: WrapOp;
  /** Env var name. Omitted for `add_flags`/`inherit_argv0`. */
  var?: string;
  /** Separator for `prefix`/`suffix` (e.g. ":"). */
  sep?: string;
  /** Value sources, joined by `sep` for `prefix`/`suffix`. */
  sources?: RuntimeSource[];
}

/** Declarative runtime metadata attached to a Process recipe. */
export interface RuntimeMeta {
  /** Env contributed to anything that runtime-depends on this output. */
  provides?: RuntimeDirective[];
  /** Directives applied when wrapping this output's own executables. */
  wrapper?: RuntimeDirective[];
}

// ---------------------------------------------------------------------------
// Source builders
// ---------------------------------------------------------------------------

/** A literal string value (no existence guard). */
export const literal = (value: string): RuntimeSource => ({ literal: value });

/** A subpath within this output's own prefix, e.g. `share/glib-2.0/schemas`. */
export const selfPath = (sub: string): RuntimeSource => ({ self: sub });

/** A subpath within a named runtime dependency, e.g. `depRef("glib", "libexec/gio-launch-desktop")`. */
export const depRef = (name: string, sub: string): RuntimeSource => ({ dep: { name, sub } });

/** Resolve to the first source whose path exists. */
export const firstExisting = (...sources: RuntimeSource[]): RuntimeSource => ({
  first_existing: sources,
});

// ---------------------------------------------------------------------------
// Directive builders
// ---------------------------------------------------------------------------

/** Always set `name` to the resolved value(s). */
export const setEnv = (name: string, ...sources: RuntimeSource[]): RuntimeDirective => ({
  op: "set",
  var: name,
  sources,
});

/** Set `name` only if it is not already present in the environment. */
export const setDefaultEnv = (name: string, ...sources: RuntimeSource[]): RuntimeDirective => ({
  op: "set_default",
  var: name,
  sources,
});

/** Remove `name` from the environment. */
export const unsetEnv = (name: string): RuntimeDirective => ({ op: "unset", var: name });

/** Prepend the resolved value(s) to `name`, joined by `sep` (default ":"). */
export const prefixEnv = (
  name: string,
  sources: RuntimeSource[],
  sep = ":",
): RuntimeDirective => ({ op: "prefix", var: name, sep, sources });

/** Append the resolved value(s) to `name`, joined by `sep` (default ":"). */
export const suffixEnv = (
  name: string,
  sources: RuntimeSource[],
  sep = ":",
): RuntimeDirective => ({ op: "suffix", var: name, sep, sources });

/** Add flags before the user's args. */
export const addFlags = (...sources: RuntimeSource[]): RuntimeDirective => ({
  op: "add_flags",
  sources,
});

/** Set the executed process's `argv[0]` to the resolved value. */
export const setArgv0 = (source: RuntimeSource): RuntimeDirective => ({
  op: "argv0",
  sources: [source],
});

/** Inherit the original `argv[0]` passed to the wrapper (keeps `ps`/profilers
 *  showing the real application name). */
export const inheritArgv0 = (): RuntimeDirective => ({ op: "inherit_argv0" });

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Merge several runtime-metadata fragments into one.
 *
 * Fragments are combined by concatenating their `provides` lists (in order),
 * then their `wrapper` lists (in order). `undefined` fragments are skipped.
 * This lets a recipe author compose helper-supplied fragments with their own
 * directives, e.g.:
 *
 * ```ts
 * runtime: mergeRuntime(
 *   gtkAppRuntime,                        // a shared helper fragment
 *   { wrapper: [setEnv("MAGIC", selfPath("share/misc/magic.mgc"))] },
 * )
 * ```
 *
 * No deduplication or deep merging is performed — see the module header for
 * why ordered concatenation is the right primitive here.
 */
export const mergeRuntime = (...parts: (RuntimeMeta | undefined)[]): RuntimeMeta => {
  const provides: RuntimeDirective[] = [];
  const wrapper: RuntimeDirective[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.provides) provides.push(...part.provides);
    if (part.wrapper) wrapper.push(...part.wrapper);
  }
  return { provides, wrapper };
};
