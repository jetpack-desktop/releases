# OS Kernel Sandboxing & Network Isolation

JetPack runs native host processes without virtual machines by confining every primary worker (`[execution]`) and companion service (`[services.<name>]`) inside an operating-system kernel sandbox. If no sandbox implementation exists for the host OS, worker launch fails with `JetPackError::SandboxError` before any process is spawned.

## Cross-Platform Kernel Sandbox Matrix

| Security Dimension | Windows (`windows/amd64`) | macOS (`darwin/arm64`) | Linux (`linux/amd64`) |
| :--- | :--- | :--- | :--- |
| **Kernel Mechanism** | **AppContainer** (`CreateAppContainerProfile`) + **Low Integrity SID** | **Apple Seatbelt** (`sandbox_init` with inline SBPL `(deny default)`) | Unprivileged **Bubblewrap (`bwrap`)** namespaces + **Landlock LSM** (`SYS_LANDLOCK_RESTRICT_SELF` via `sandbox-landlock-exec`) |
| **Process Tree Cleanup** | Win32 **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` | Process group `killpg` (`SIGKILL` after grace period) | Namespace / PID isolation + `killpg` cleanup |
| **Job Workspace Access** | Explicit NTFS DACL (`SetNamedSecurityInfoW`) granting Read/Write on `<root>/workspaces/job_<id>` | SBPL `file-read*` + `file-write*` limited to `<root>/workspaces/job_<id>` | `--bind` + Landlock RW rule on `<root>/workspaces/job_<id>` |
| **Shared Runtimes Access** | Explicit NTFS DACL Read-Only on `<root>/runtimes/` | SBPL `file-read*` on `<root>/runtimes/` + system libs (`/System`, `/usr/lib`, `dyld`) | `--ro-bind` + Landlock RO rule on `<root>/runtimes/` |
| **User Files (`~/Documents`, etc.)** | **Denied by default** (Low Integrity AppContainer lacks user profile ACLs) | **Denied by default** (`EPERM` / `Operation not permitted`) | **Denied by default** (`pivot_root` + Landlock LSM) |
| **Direct Host Network** | **Denied by default** (no internetClient capability granted to AppContainer) | **Denied by default** (`(deny default)` blocks outbound sockets & Mach services) | **Denied by default** (`CLONE_NEWNET` creates isolated loopback-only netns) |
| **GPU Acceleration Gate** (`permissions.gpu_access = true`) | DirectML / CUDA device access permitted inside sandbox | Conditional `(allow iokit-open (iokit-user-client-class "AGXDeviceUserClient"))` | Conditional `--dev-bind` for `/dev/dri` and `/dev/nvidia*` |
| **Cleanup on Exit** | Deletes per-job `AppContainer` profile + closes Job Object handle | Releases sandboxed child process & job workspace | Tears down `bwrap` mounts & kills process tree |

## Default-Deny Policy & `app.toml` Permissions

When `[permissions]` is omitted from `app.toml`, JetPack applies strict defaults:

```toml
[permissions]
filesystem_scopes = []
network_allowlist = []
gpu_access = false
```

- **No absolute host paths**: Manifest validation rejects any path containing `..`, leading `/`, Windows drive prefixes, or `~` in `filesystem_scopes`.
- **No dynamic linker hijacking**: `[execution].env` and `[services.<name>].env` reject `LD_PRELOAD`, `LD_LIBRARY_PATH`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`, `DYLD_LIBRARY_PATH`, `DYLD_FRAMEWORK_PATH`, `PYTHONINSPECT`, and `PYTHONPATH`.
- **Guaranteed VRAM/RAM reclamation**: When a WebSocket session disconnects, `jetpack-daemon` shuts down, or a worker exceeds `execution.timeout_secs`, `WorkerLifecycleManager` sends a termination signal and forcefully reaps the entire process tree after `graceful_shutdown_secs` (`10s` default), releasing GPU VRAM immediately.

## Local IPC & Userspace Network Proxy

Because sandboxed workers have **no direct access to host network interfaces**, outbound traffic is brokered exclusively by `jetpack-daemon`:

### 1. Kernel-Authenticated Local IPC

- **macOS & Linux**: Unix Domain Socket at `<root>/workspaces/job_<id>/ipc.sock` with strict `0o600` file permissions.
- **Windows**: Named Pipe `\\.\pipe\jetpack-worker-<job_id>` configured with an explicit DACL allowing only the current user SID and the job's dedicated AppContainer SID (`S-1-15-2-...`).

### 2. Userspace Network Proxy (`permissions.network_allowlist`)

`jetpack-daemon` runs an asynchronous userspace HTTP/CONNECT proxy exposed to the worker via `JETPACK_PROXY_ENDPOINT` (plus `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`):

1. **Allowlist Matching**: Every outbound `CONNECT` or HTTP request checks the destination `host:port` against `permissions.network_allowlist` in `app.toml` (supports exact matches like `api.openai.com:443`, wildcard subdomains like `*.huggingface.co:443`, and explicit non-loopback endpoints).
2. **Forbidden Rules**: Global wildcards (`*`, `*:*`, `0.0.0.0:*`) are rejected at manifest validation time (`crates/jetpack-common/src/manifest.rs`), and workers cannot target `127.0.0.1:9470` or daemon internal ports through the proxy.
3. **Blocking & Audit Logging**: Requests to unlisted domains are rejected immediately with `403 Forbidden` before opening any upstream TCP socket, and a security audit event is logged by `jetpack-daemon`. Raw `connect()` syscalls bypassing the proxy fail at the kernel level (`ENETUNREACH`, `EPERM`, or `WSAEACCES`).
