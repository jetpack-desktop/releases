# Manifest Reference (`app.toml`)

Every JetPack native application is governed by an `app.toml` manifest parsed into `AppManifest` (`crates/jetpack-common/src/manifest.rs`) with `#[serde(deny_unknown_fields)]`. Any unrecognized or misspelled field fails validation immediately.

Validate any manifest locally with:

```bash
jetpack-daemon --validate-manifest path/to/app.toml
```

## Complete Annotated Example

```toml
[package]
id = "com.dev.example-worker"
name = "Example Compute Worker"
version = "0.1.0"
description = "Annotated reference worker demonstrating all eight JetPack app.toml sections."
authors = ["Your Name <dev@example.com>"]
license = "MIT"
homepage = "https://example.com/jetpack-worker"

[hardware]
min_ram_mb = 512
min_vram_mb = 0
min_disk_mb = 128
accelerators = ["metal", "cuda", "cpu"]
architectures = ["darwin/arm64", "linux/amd64", "windows/amd64"]

[runtimes.python]
version = "3.12.6"
digest = "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
image = "ghcr.io/jetpack/runtime-python:3.12.6"
target_dir = "runtimes/python"

[runtimes.ffmpeg]
version = "9.0.2"
target_dir = "runtimes/ffmpeg-9.0.2"

[runtimes.ffmpeg.platforms."darwin/arm64"]
url = "https://github.com/Tyrrrz/FFmpegBin/releases/download/9.0.2/ffmpeg-osx-arm64.zip"
digest = "sha256:7d22a2893ccd761c3b4214165975e306d6c85c1de188f79f7e2723070c0006e4"

[python_env]
python_version = "3.12"
requirements = ["jetpack-sdk"]
# uv_lock_sha256 = "428843fd0e0da23463920ba9aa0191a39f32a47b02e97a936c974ba996b4b98f"
isolated = true

[python_env.backend_indexes]
cuda = "https://download.pytorch.org/whl/cu124"
cpu = "https://download.pytorch.org/whl/cpu"

[services.preprocessor]
command = "bin/preprocessor.py"
args = ["--workers", "1"]
restart_policy = "on-failure"
depends_on = []

[services.preprocessor.env]
LOG_FORMAT = "compact"

[volumes.inputs]
mode = "read-only"

[volumes.outputs]
mode = "read-write"

[permissions]
gpu_access = true
filesystem_scopes = ["cache"]
network_allowlist = ["huggingface.co:443"]
max_memory_mb = 4096

[execution]
entrypoint = "worker.py"
args = []
# working_dir = "."
ipc_transport = "auto"
graceful_shutdown_secs = 10

[execution.env]
JETPACK_LOG_LEVEL = "info"
```

---

## Section-by-Section Reference

### 1. `[package]` (Required)

| Field | Type | Required | Validation Rules |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Matches `^[a-z0-9][a-z0-9._-]{1,126}[a-z0-9]$`; no `..` or slashes. `io.jetpack.*` is reserved for verified catalog apps. |
| `name` | `string` | Yes | Non-empty human-readable display name. |
| `version` | `string` | Yes | Strict SemVer (`MAJOR.MINOR.PATCH`). |
| `description` | `string` | No | Short UI description (defaults to `""`). |
| `authors` | `string[]` | No | Package author strings. |
| `license` | `string` | No | Optional SPDX license identifier. |
| `homepage` | `string` | No | Optional project homepage URL. |

### 2. `[hardware]` (Required)

| Field | Type | Required | Validation Rules |
| :--- | :--- | :--- | :--- |
| `min_ram_mb` | `u64` | No | Minimum system RAM in MiB (`0` default). |
| `min_vram_mb` | `u64` | No | Minimum GPU VRAM in MiB (`0` default). |
| `min_disk_mb` | `u64` | No | Minimum disk space in MiB (`0` default). |
| `accelerators` | `string[]` | No | Allowed values: `cpu`, `cuda`, `metal`, `mps`, `mlx`, `rocm`, `vulkan`, `directml`. |
| `architectures` | `string[]` | Yes | Non-empty list of `windows/amd64`, `darwin/arm64`, `linux/amd64`. |

### 3. `[runtimes.<name>]` (Optional)

| Field | Type | Required | Validation Rules |
| :--- | :--- | :--- | :--- |
| `version` | `string` | Yes | Runtime version string (e.g. `"3.12.6"`). |
| `digest` | `string` | Conditional | `sha256:<64-hex>` digest (required unless `platforms` supplies per-platform entries). |
| `image` | `string` | No | OCI artifact reference (e.g. `ghcr.io/jetpack/runtime-python:3.12.6`). |
| `url` | `string` | No | Direct HTTPS archive URL (`.tar.gz`, `.tgz`, `.zip`). |
| `platforms."<os/arch>"` | `table` | No | Per-platform `{ digest, url?, image? }` overrides keyed by `TargetPlatform`. |
| `target_dir` | `string` | Yes | Relative path inside the app bundle (no `..` or leading `/`). |

### 4. `[python_env]` (Optional)

| Field | Type | Required | Validation Rules |
| :--- | :--- | :--- | :--- |
| `python_version` | `string` | Yes | Target Python version (e.g. `"3.12"`). |
| `requirements` | `string[]` | No | PyPI requirement specifiers (arguments starting with `-` are rejected). |
| `uv_lock_sha256` | `string` | No | 64-hex SHA-256 (or `sha256:<hex>`) verified against `uv.lock`. |
| `index_url` | `string` | No | Custom PyPI index URL. |
| `extra_index_urls` | `string[]` | No | Extra PyPI index URLs. |
| `isolated` | `bool` | No | Defaults to `true` (prevents host site-packages leakage). |
| `backend_indexes` | `map<string, string>` | No | Per-backend wheel index URLs keyed by `cuda`, `mps`, `metal`, `rocm`, or `cpu`. |

### 5. `[services.<name>]` (Optional)

| Field | Type | Required | Validation Rules |
| :--- | :--- | :--- | :--- |
| `command` | `string` | Yes | Relative executable path inside the app bundle (no `..` or absolute paths). |
| `args` | `string[]` | No | CLI arguments for the companion service. |
| `env` | `map<string, string>` | No | Sanitized environment variables (forbidden linker vars rejected). |
| `depends_on` | `string[]` | No | Other `[services]` keys; validated with DFS cycle detection. |
| `restart_policy` | `string` | No | `"never"` (default), `"on-failure"`, or `"always"`. |
| `healthcheck_ipc` | `string` | No | Optional relative IPC healthcheck endpoint. |

### 6. `[volumes.<name>]` (Optional)

| Field | Type | Required | Validation Rules |
| :--- | :--- | :--- | :--- |
| `mode` | `string` | Yes | `"read-only"` or `"read-write"`. Host paths are **strictly forbidden** in `app.toml`. |

### 7. `[permissions]` (Optional; Defaults to Strict Default-Deny)

| Field | Type | Default | Validation Rules |
| :--- | :--- | :--- | :--- |
| `filesystem_scopes` | `string[]` | `[]` | Relative subdirectories inside the job workspace (no `/`, `..`, `~`, or drive prefixes). |
| `network_allowlist` | `string[]` | `[]` | Allowed `host:port` endpoints for the Userspace Proxy (wildcards `*`, `0.0.0.0:*`, and loopback daemon ports rejected). |
| `gpu_access` | `bool` | `false` | Enables OS GPU driver/device access (`AGXDeviceUserClient`, `/dev/dri`, `/dev/nvidia*`, CUDA, DirectML). |
| `max_memory_mb` | `u64` | `None` | Optional memory ceiling in MiB (must be `> 0` if set). |

### 8. `[execution]` (Required)

| Field | Type | Required | Validation Rules |
| :--- | :--- | :--- | :--- |
| `entrypoint` | `string` | Yes | Relative path to primary script/binary inside the bundle. |
| `args` | `string[]` | No | CLI arguments passed to the entrypoint. |
| `env` | `map<string, string>` | No | Sanitized env vars. Rejects `LD_PRELOAD`, `LD_LIBRARY_PATH`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`, `DYLD_LIBRARY_PATH`, `DYLD_FRAMEWORK_PATH`, `PYTHONINSPECT`, `PYTHONPATH`. |
| `working_dir` | `string` | No | Optional relative working directory. |
| `ipc_transport` | `string` | No | `"auto"` (default), `"unix_socket"`, or `"named_pipe"`. |
| `timeout_secs` | `u64` | No | Optional idle/execution timeout in seconds. |
| `graceful_shutdown_secs` | `u64` | No | Grace period before `SIGKILL`/`TerminateProcess` (default `10`, must be `> 0`). |
