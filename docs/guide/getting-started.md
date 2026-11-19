# Getting Started

This guide walks through building `jetpack-daemon`, inspecting your host hardware profile, starting the background tray daemon, and opening the embedded **Control Center** at `http://127.0.0.1:9470`.

## Prerequisites

- **Rust 1.75+** (stable toolchain) with the WebAssembly target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- **Node.js 20+** and `npm` (for building the WASM bindings and Control Center UI, or running the documentation portal).
- **Platform notes**:
  - **Windows (`windows/amd64`)**: Standard user account; no Administrator / UAC elevation required.
  - **macOS (`darwin/arm64`)**: Apple Silicon with Xcode Command Line Tools (`Metal.framework` is detected automatically).
  - **Linux (`linux/amd64`)**: `bubblewrap` (`bwrap`) installed with unprivileged user namespaces enabled, plus a kernel supporting Landlock LSM (`Linux 5.13+`).

## 1. Build the Daemon and Embedded Control Center

Build the WASM client, compile the Control Center frontend (`web/dist/`), and produce the single `jetpack-daemon` release binary:

```bash
make web-install
make release-daemon
```

Or run the debug workspace build during development:

```bash
cargo build --workspace
```

## 2. Verify Host Hardware Discovery

Probe your CPU topology, system/unified memory, and GPU adapters (`NVML` / `Vulkan` / `DX12` / `Metal`) directly in user space:

```bash
./target/debug/jetpack-daemon --print-hardware-profile
```

Example output on Apple Silicon:

```text
JetPack Hardware Profile (macos/aarch64)
  CPU:    Apple M1 Pro (10 physical / 10 logical cores, 8P + 2E)
  Memory: 16384 MiB total / 3241 MiB available (unified=true, recommended_max_working_set=12124 MiB)
  GPUs (1 detected):
    [0] Apple M1 Pro | vendor=Apple | backend=Metal | driver=Metal | vram=12124 MiB total (3241 MiB free) | unified=true
```

## 3. Start the Daemon and Open Control Center

Launch `jetpack-daemon`:

```bash
RUST_LOG=info ./target/release/jetpack-daemon
```

*(For headless CI or SSH environments without a desktop system tray, pass `--headless`.)*

When started:
1. `JetPackPaths::init_dirs()` initializes your isolated user-space directory (`0700` on Unix).
2. `jetpack-daemon` registers the `jetpack://` custom URI scheme in user space (`HKCU\Software\Classes` on Windows, `~/.local/share/applications/jetpack-daemon.desktop` on Linux, bundle `Info.plist` on macOS).
3. The system tray icon appears in the OS menu bar / notification area with quick status and shortcuts.
4. The loopback gatekeeper and embedded Control Center start listening strictly on `127.0.0.1:9470`.

Open the Control Center in your browser:

```text
http://127.0.0.1:9470
```

From the Control Center you can:
- Inspect live CPU, RAM, and GPU telemetry (`hardware.get_profile`).
- Browse and install verified applications from the `Ed25519`-signed **App Store** (`SignedAppCatalog`). Official release installers pre-bundle only the slimmed `examples/ffmpeg-media-converter` starter worker (`io.jetpack.media-converter`) to minimize installer size, while other services are downloaded on demand from the catalog.
- Launch or terminate installed apps, reset cached volume folder authorizations, and monitor local developer apps (`UNVERIFIED / LOCAL DEV`).
- Review and revoke paired browser origins (`paired_clients.db`).
- Export a secret-redacted `.zip` diagnostic bundle (`diagnostics.json` + bounded `daemon.log` tail) from **My Hardware & Security -> Diagnostics & Support Logs**, the system tray (**"Export Diagnostics..."**), or CLI (`jetpack-daemon --export-diagnostics`). Optional HTTP JSON reporting is disabled by default (`[diagnostics].report_url = None` in `daemon.toml`) and enforces `https://` (or loopback `http://` for local testing) with bounded `request_timeout_secs` (`1..=60`).

## 4. Run Built-In Verification Smoke Tests

Before connecting an external web app or publishing workers, you can verify the entire local security stack offline:

```bash
# 1. Verify 127.0.0.1 binding, PNA headers, X25519/Ed25519 handshake, ChaCha20-Poly1305 & 1003 JSON rejection
./target/debug/jetpack-daemon --ws-smoke-test

# 2. Verify OCI multi-arch CAS & hardlink/APFS clone deduplication
./target/debug/jetpack-daemon --oci-smoke-test

# 3. Verify isolated uv + python-build-standalone provisioner
./target/debug/jetpack-daemon --python-smoke-test

# 4. Verify OS native kernel sandbox (AppContainer / Seatbelt / bwrap+Landlock)
./target/debug/jetpack-daemon --sandbox-smoke-test

# 5. Verify sandboxed worker IPC, userspace network proxy & lifecycle cleanup
./target/debug/jetpack-daemon --worker-ipc-smoke-test
```

## Next Steps

- Connect a web app using the [@jetpack/client Quickstart](/sdk/frontend/quickstart).
- Scaffold your first Python worker with `--init-app` in the [CLI Tools Reference](/publishing/cli-tools).
- Inspect the cryptographic and sandbox guarantees in [Security Overview](/security/overview).
