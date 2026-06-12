//! Profile secrets — age-encrypted secrets managed by hod profiles.
//!
//! `ageSecret()` imports an encrypted `.age` file into the hod store as a blob
//! and returns a `SecretDefinition` for inclusion in a profile's `secrets` array.
//! During activation, hod generates a decrypt script and a user systemd unit
//! that decrypts all profile secrets into `$XDG_RUNTIME_DIR/hod/secrets/<profile>/`.
//!
//! Encrypted blobs are safe to store in git and the hod store.
//! Plaintext is never written to the store — only to the ephemeral runtime dir.

import { importBlob } from "./cli.js";

export interface SecretDefinition {
  name: string;
  content_hash: string;
  mode: string;
}

export async function ageSecret(
  name: string,
  opts: { source: string; mode?: string },
): Promise<SecretDefinition> {
  const content_hash = await importBlob(opts.source);
  return {
    name,
    content_hash,
    mode: opts.mode ?? "0400",
  };
}
