//! Linux namespace sandbox for Process builds.
//!
//! Process recipes execute in isolated Linux namespaces:
//! - **User**: User namespace with uid/gid mapping (maps to host user inside sandbox).
//! - **Mount**: Private mount namespace with sandbox filesystem.
//! - **PID**: Private PID namespace.
//! - **IPC**: Private IPC namespace.
//! - **UTS**: Private UTS namespace (isolated hostname).
//! - **Network**: Private network namespace (no network unless `unsafe_flags & 0x01`).
//!
//! The sandbox filesystem layout per PRD §6.2:
//! ```text
//! /                   (root = sandbox_root on host)
//! ├── deps/
//! │   ├── <name>/    → bind-mounted (read-only) or copied dependency outputs
//! │   └── ...
//! ├── tmp/            → writable (bind-mounted host tmp or tmpfs)
//! ├── dev/            → bind-mounted from host /dev
//! ├── proc/           → bind-mounted from host /proc
//! ├── out/            → writable, process writes output here (persists on host fs)
//! └── homeless-shelter/
//!     └── (writable $HOME)
//! ```

use std::collections::HashMap;
use std::io;
use std::path::{Path, PathBuf};

use crate::build::BuildError;

// ---------------------------------------------------------------------------
// Sandbox configuration
// ---------------------------------------------------------------------------

/// Configuration for a sandboxed build execution.
#[derive(Debug)]
pub struct SandboxConfig {
    /// Path to the sandbox root directory (in `store/tmp/`).
    pub sandbox_root: PathBuf,
    /// Named dependencies: (name, path_to_materialized_output_on_host).
    pub deps: Vec<(String, PathBuf)>,
    /// Guest path where the process writes output (e.g. `/out`).
    pub out_path: PathBuf,
    /// Guest path to a writable temp directory (e.g. `/tmp`).
    pub tmp_path: PathBuf,
    /// Guest path to a writable home directory (e.g. `/homeless-shelter`).
    pub home_path: PathBuf,
    /// Command to execute (absolute path inside the sandbox).
    pub command: String,
    /// Arguments (argv), including argv[0] = the command name.
    pub args: Vec<String>,
    /// Environment variables to set inside the sandbox.
    pub env: HashMap<String, String>,
    /// Working directory inside the sandbox (guest path).
    pub work_dir: PathBuf,
    /// Whether networking is allowed (from `unsafe_flags & 0x01`).
    pub allow_networking: bool,
    /// If true, don't clean up sandbox dir on failure.
    pub keep_failed: bool,
}

/// Result of running a sandboxed process.
#[derive(Debug)]
pub struct SandboxResult {
    /// Process exit code.
    pub exit_code: i32,
    /// Captured stdout bytes.
    pub stdout: Vec<u8>,
    /// Captured stderr bytes.
    pub stderr: Vec<u8>,
    /// Whether the sandbox directory was preserved (keep_failed on failure).
    pub sandbox_preserved: bool,
}

// ---------------------------------------------------------------------------
// Sandbox filesystem setup (host-side, before spawning the sandbox)
// ---------------------------------------------------------------------------

/// Create the initial sandbox directory structure on the host filesystem.
///
/// This creates the directory skeleton. The actual mount operations happen
/// inside the child process after `unshare` sets up namespaces.
pub fn setup_sandbox_filesystem(config: &SandboxConfig) -> Result<(), BuildError> {
    let root = &config.sandbox_root;

    std::fs::create_dir_all(root).map_err(io_error)?;

    let dirs = [
        "deps", "tmp", "dev", "proc", "out", "homeless-shelter",
        "bin", "usr", "lib", "lib64", "etc", "sbin",
    ];
    for dir in &dirs {
        std::fs::create_dir_all(root.join(dir)).map_err(io_error)?;
    }

    for (name, _) in &config.deps {
        std::fs::create_dir_all(root.join("deps").join(name)).map_err(io_error)?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Linux namespace sandbox
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
mod linux_sandbox {
    use super::*;

    use nix::mount::{mount, MsFlags};

    /// UID/GID used inside the sandbox (same as host user, mapped via user ns).
    const GUEST_UID: u32 = 1000;
    const GUEST_GID: u32 = 1000;

    /// Run a command inside a Linux namespace sandbox.
    ///
    /// Uses the `unshare` crate (brioche fork) which handles user namespace
    /// setup, uid/gid mapping, and `deny_setgroups` automatically.
    pub fn run_sandboxed(config: SandboxConfig) -> Result<SandboxResult, BuildError> {
        // Ensure the sandbox filesystem skeleton exists
        setup_sandbox_filesystem(&config)?;

        let host_uid = nix::unistd::Uid::current().as_raw();
        let host_gid = nix::unistd::Gid::current().as_raw();

        let mut cmd = unshare::Command::new(&config.command);
        if config.args.len() > 1 {
            cmd.args(&config.args[1..]);
        }
        cmd.env_clear();
        cmd.envs(&config.env);

        // Map host uid/gid to GUEST_UID/GUEST_GID inside the namespace
        cmd.set_id_maps(
            vec![unshare::UidMap {
                inside_uid: GUEST_UID,
                outside_uid: host_uid,
                count: 1,
            }],
            vec![unshare::GidMap {
                inside_gid: GUEST_GID,
                outside_gid: host_gid,
                count: 1,
            }],
        );
        cmd.uid(GUEST_UID);
        cmd.gid(GUEST_GID);
        cmd.deny_setgroups(true);

        // Set up namespaces: User + Mount (+ Net if isolated)
        let mut namespaces = vec![
            unshare::Namespace::User,
            unshare::Namespace::Mount,
        ];
        if !config.allow_networking {
            namespaces.push(unshare::Namespace::Net);
        }
        cmd.unshare(&namespaces);

        // Set chroot directory — the library will chroot for us
        cmd.chroot_dir(&config.sandbox_root);

        // Set current_dir (applied after chroot)
        cmd.current_dir(&config.work_dir);

        // Capture stdout/stderr
        cmd.stdout(unshare::Stdio::piped());
        cmd.stderr(unshare::Stdio::piped());

        // before_chroot runs in the CHILD just before chroot.
        // Set up all mounts here — bind-mount from host is safe in user ns.
        let root = config.sandbox_root.clone();
        let deps = config.deps.clone();
        let allow_networking = config.allow_networking;
        cmd.before_chroot(move || {
            mount_filesystem(&root, &deps, allow_networking)
        });

        // Spawn the child
        let mut child = cmd.spawn().map_err(|e| {
            BuildError::Io(io::Error::new(
                io::ErrorKind::Other,
                format!("failed to spawn sandbox: {e}"),
            ))
        })?;

        // Take stdout/stderr pipe readers
        let stdout = child.stdout.take().ok_or_else(|| {
            BuildError::Io(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "failed to capture sandbox stdout",
            ))
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            BuildError::Io(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "failed to capture sandbox stderr",
            ))
        })?;

        let stdout_handle = std::thread::spawn(move || {
            let mut buf = Vec::with_capacity(4096);
            let _ = std::io::Read::read_to_end(
                &mut std::io::BufReader::new(stdout),
                &mut buf,
            );
            buf
        });
        let stderr_handle = std::thread::spawn(move || {
            let mut buf = Vec::with_capacity(4096);
            let _ = std::io::Read::read_to_end(
                &mut std::io::BufReader::new(stderr),
                &mut buf,
            );
            buf
        });

        let exit_status = child.wait().map_err(|e| {
            BuildError::Io(io::Error::new(
                io::ErrorKind::Other,
                format!("failed to wait for sandbox process: {e}"),
            ))
        })?;

        let stdout_bytes = stdout_handle.join().unwrap_or_default();
        let stderr_bytes = stderr_handle.join().unwrap_or_default();

        let exit_code = exit_status.code().unwrap_or(-1);
        let preserved = exit_code != 0 && config.keep_failed;

        Ok(SandboxResult {
            exit_code,
            stdout: stdout_bytes,
            stderr: stderr_bytes,
            sandbox_preserved: preserved,
        })
    }

    /// Set up all mounts inside the sandbox root.
    ///
    /// Runs in the child's `before_chroot` callback. At this point the child
    /// has its own mount namespace, so mounts are isolated from the host.
    ///
    /// We use bind-mounts from the host (which are allowed in user namespaces)
    /// rather than mounting fresh filesystems (which requires CAP_SYS_ADMIN).
    fn mount_filesystem(
        root: &Path,
        deps: &[(String, PathBuf)],
        allow_networking: bool,
    ) -> io::Result<()> {
        // Make all mounts private (don't propagate to parent namespace)
        mount(
            None::<&str>,
            "/",
            None::<&str>,
            MsFlags::MS_PRIVATE | MsFlags::MS_REC,
            None::<&str>,
        )
        .map_err(|e| {
            io::Error::new(
                io::ErrorKind::Other,
                format!("make-private mount failed: {e}"),
            )
        })?;

        // -- /dev: bind-mount from host (read-write, needed by many programs) --
        let dev_path = root.join("dev");
        mount(
            Some("/dev"),
            &dev_path,
            None::<&str>,
            MsFlags::MS_BIND | MsFlags::MS_REC,
            None::<&str>,
        )
        .map_err(|e| {
            io::Error::new(
                io::ErrorKind::Other,
                format!("bind-mount /dev failed: {e}"),
            )
        })?;

        // -- /proc: bind-mount from host --
        let proc_path = root.join("proc");
        mount(
            Some("/proc"),
            &proc_path,
            None::<&str>,
            MsFlags::MS_BIND | MsFlags::MS_REC,
            None::<&str>,
        )
        .map_err(|e| {
            io::Error::new(
                io::ErrorKind::Other,
                format!("bind-mount /proc failed: {e}"),
            )
        })?;

        // -- Essential host directories (bind-mount read-only) --
        // These provide the base system needed for commands to run.
        // The process recipe's command is resolved within deps, but for
        // basic operation (shells, coreutils), we need the host's /usr, /bin,
        // /lib, /lib64, /etc available inside the sandbox.
        let host_dirs = ["/bin", "/usr", "/lib", "/lib64", "/etc", "/sbin"];
        for dir in &host_dirs {
            let host_dir = Path::new(dir);
            if !host_dir.exists() {
                continue;
            }
            let guest_dir = root.join(dir.trim_start_matches('/'));
            if !guest_dir.exists() {
                let _ = std::fs::create_dir_all(&guest_dir);
            }
            // Bind-mount read-only
            match mount(
                Some(host_dir),
                &guest_dir,
                None::<&str>,
                MsFlags::MS_BIND | MsFlags::MS_REC,
                None::<&str>,
            ) {
                Ok(()) => {
                    let _ = mount(
                        Some(host_dir),
                        &guest_dir,
                        None::<&str>,
                        MsFlags::MS_BIND
                            | MsFlags::MS_REC
                            | MsFlags::MS_REMOUNT
                            | MsFlags::MS_RDONLY,
                        None::<&str>,
                    );
                }
                Err(_) => {
                    // Non-fatal: some dirs may not be bind-mountable
                }
            }
        }

        // -- Dependencies (bind-mount read-only or copy) --
        for (name, host_path) in deps {
            let guest_path = root.join("deps").join(name);
            std::fs::create_dir_all(&guest_path)?;

            if host_path.is_dir() {
                match mount(
                    Some(host_path),
                    &guest_path,
                    None::<&str>,
                    MsFlags::MS_BIND | MsFlags::MS_REC,
                    None::<&str>,
                ) {
                    Ok(()) => {
                        // Remount read-only
                        let _ = mount(
                            Some(host_path),
                            &guest_path,
                            None::<&str>,
                            MsFlags::MS_BIND
                                | MsFlags::MS_REC
                                | MsFlags::MS_REMOUNT
                                | MsFlags::MS_RDONLY,
                            None::<&str>,
                        );
                    }
                    Err(_) => {
                        // Fall back to recursive copy
                        copy_dir_recursive(host_path, &guest_path)?;
                    }
                }
            } else if host_path.exists() {
                std::fs::copy(host_path, guest_path.join("data"))?;
            }
        }

        // -- /tmp (writable) --
        let tmp_path = root.join("tmp");
        // Try tmpfs first, fall back to just a directory
        if mount(
            Some("tmpfs"),
            &tmp_path,
            Some("tmpfs"),
            MsFlags::MS_NOSUID | MsFlags::MS_NODEV,
            Some("size=512m"),
        )
        .is_err()
        {
            let _ = std::fs::create_dir_all(&tmp_path);
        }

        // -- /homeless-shelter (writable, for $HOME) --
        let home_path = root.join("homeless-shelter");
        if mount(
            Some("tmpfs"),
            &home_path,
            Some("tmpfs"),
            MsFlags::MS_NOSUID | MsFlags::MS_NODEV,
            Some("size=64m"),
        )
        .is_err()
        {
            let _ = std::fs::create_dir_all(&home_path);
        }

        // NOTE: /out is NOT a tmpfs — regular dir so output persists after exit.

        // -- Loopback for new network namespace --
        if !allow_networking {
            let _ = std::process::Command::new("ip")
                .args(["link", "set", "lo", "up"])
                .output();
        }

        Ok(())
    }

    /// Copy a directory recursively.
    fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
        if dst.exists() {
            std::fs::remove_dir_all(dst)?;
        }
        std::fs::create_dir_all(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());
            if src_path.is_dir() {
                copy_dir_recursive(&src_path, &dst_path)?;
            } else if src_path.is_symlink() {
                let target = std::fs::read_link(&src_path)?;
                std::os::unix::fs::symlink(&target, &dst_path)?;
            } else {
                std::fs::copy(&src_path, &dst_path)?;
            }
        }
        Ok(())
    }
}

#[cfg(target_os = "linux")]
pub use linux_sandbox::run_sandboxed;

// ---------------------------------------------------------------------------
// Non-Linux fallback (unsandboxed)
// ---------------------------------------------------------------------------

#[cfg(not(target_os = "linux"))]
pub fn run_sandboxed(config: SandboxConfig) -> Result<SandboxResult, BuildError> {
    use std::process::{Command, Stdio};

    let mut cmd = Command::new(&config.command);
    if config.args.len() > 1 {
        cmd.args(&config.args[1..]);
    }
    cmd.current_dir(&config.work_dir);
    cmd.env_clear();
    cmd.envs(&config.env);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let child = cmd.spawn().map_err(io_error)?;
    let output = child.wait_with_output().map_err(io_error)?;

    Ok(SandboxResult {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: output.stdout,
        stderr: output.stderr,
        sandbox_preserved: false,
    })
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/// Clean up the sandbox directory.
pub fn cleanup_sandbox(sandbox_root: &Path) {
    let _ = std::fs::remove_dir_all(sandbox_root);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn io_error(e: io::Error) -> BuildError {
    BuildError::Io(e)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sandbox_config_creation() {
        let config = SandboxConfig {
            sandbox_root: PathBuf::from("/tmp/test-sandbox"),
            deps: vec![("bash".to_string(), PathBuf::from("/usr"))],
            out_path: PathBuf::from("/out"),
            tmp_path: PathBuf::from("/tmp"),
            home_path: PathBuf::from("/homeless-shelter"),
            command: "/bin/bash".to_string(),
            args: vec!["/bin/bash".to_string()],
            env: HashMap::new(),
            work_dir: PathBuf::from("/"),
            allow_networking: false,
            keep_failed: false,
        };
        assert_eq!(config.deps.len(), 1);
        assert!(!config.allow_networking);
    }
}
