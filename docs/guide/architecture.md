# Architecture & User Space

JetPack separates untrusted browser code, security enforcement, and heavy native computation into three strictly isolated tiers.

## Three-Tier System Architecture

```text
+-----------------------------------------------------------------------------+
| Tier 1: Browser / WASM Frontend                                             |
|   @jetpack/client (TypeScript) -> jetpack-wasm (wasm32-unknown-unknown)     |
|   - Persistent Ed25519 / X25519 identity in localStorage                    |
|   - Out-of-Band pairing via jetpack://pair                                  |
|   - Encrypted binary WebSocket client (ws://127.0.0.1:9470)                 |
+--------------------------------------+--------------------------------------+
                                       |
                                       | 127.0.0.1:9470 (Origin + PNA + X25519
                                       | + ChaCha20-Poly1305 Binary Framing)
                                       v
+-----------------------------------------------------------------------------+
| Tier 2: Rust Tray Gatekeeper (jetpack-daemon)                               |
|   - Embedded Control Center HTTP server (http://127.0.0.1:9470)             |
|   - ChaCha20-Poly1305 encrypted paired client & volume store (OS Vault key) |
|   - Ed25519 SignedAppCatalog verifier & anti-spoofing enforcer              |
|   - Hardware Discovery (NVML / Vulkan / DX12 / Metal / sysctl)              |
|   - OCI CAS Manager (blobs/sha256/) + uv Python + RuntimeProvisioner        |
|   - In-Daemon Userspace Network Proxy (permissions.network_allowlist)       |
|   - Cross-platform OS Sandbox Runner + WorkerLifecycleManager               |
+--------------------------------------+--------------------------------------+
                                       |
                                       | Local Kernel IPC (UDS 0600 / Named Pipe
                                       | with AppContainer DACL) + [4B len] frames
                                       v
+-----------------------------------------------------------------------------+
| Tier 3: Sandboxed Native Workers                                            |
|   - Windows: AppContainer (Low Integrity SID) + NTFS ACLs + Job Object      |
|   - macOS:   Seatbelt (deny default) + gated AGXDeviceUserClient (Metal)    |
|   - Linux:   Bubblewrap (CLONE_NEWNET, pivot_root) + Landlock LSM           |
|   - Runtimes: standalone Python (uv), ffmpeg, llama.cpp, custom binaries    |
+-----------------------------------------------------------------------------+
```

### Tier 1: WASM Frontend (`jetpack-wasm` & `@jetpack/client`)

Web applications interact with JetPack through the high-level `@jetpack/client` TypeScript package (`JetPackAppClient`) layered on top of `jetpack-wasm`. All protocol framing, `Ed25519` request signing, `X25519` key exchange, and `ChaCha20-Poly1305` encryption execute inside WebAssembly (`jetpack-proto` compiled for `wasm32-unknown-unknown`) before bytes touch the browser `WebSocket`.

### Tier 2: Rust Tray Gatekeeper (`jetpack-daemon`)

`jetpack-daemon` is a lightweight native binary (`~5–10 MB`) managing the system tray icon (`tao` + `tray-icon`), the loopback HTTP/WebSocket server on `127.0.0.1:9470`, hardware discovery, OCI bundle caching (including slim single-example release seeding), isolated Python/native runtime provisioning, native OS dialogs (`rfd`), sanitized diagnostic bundle export/reporting (`diagnostics`), and worker lifecycle supervision.

No browser client ever communicates directly with a worker socket or pipe. `jetpack-daemon` decrypts incoming WebSocket frames, authorizes the session `Origin` against the target application, and forwards plaintext hybrid frames over local kernel IPC only to the authorized worker job.

### Tier 3: Sandboxed Native Workers

Each launched job executes inside a dedicated per-job workspace (`<root>/workspaces/job_<uuid>`) under strict OS kernel confinement. Workers receive:
- `JETPACK_IPC_ENDPOINT`: local Unix Domain Socket (`ipc.sock`) or Windows Named Pipe (`\\.\pipe\jetpack-worker-<job_id>`).
- `JETPACK_PROXY_ENDPOINT` / `HTTP_PROXY` / `ALL_PROXY`: userspace network proxy endpoint when `permissions.network_allowlist` is non-empty.
- `JETPACK_VOL_<NAME>`: sandbox-mounted paths for user-selected host folders declared in `[volumes.<name>]`.
- Hermetic `PATH` prepended with `<root>/runtimes/<name>-<version>/bin` for declared `[runtimes]` dependencies.

## User-Space Directory Layout (`JetPackPaths`)

Implemented in `crates/jetpack-common/src/paths.rs`, JetPack keeps all configuration, caches, runtimes, and job workspaces strictly inside the unprivileged user's profile:

| Platform | Default Root Path |
| :--- | :--- |
| **Windows (`windows/amd64`)** | `%APPDATA%\JetPack` |
| **macOS (`darwin/arm64`)** | `~/Library/Application Support/JetPack` |
| **Linux (`linux/amd64`)** | `~/.config/jetpack` |

You can override the root directory hermetically for testing or portable installations using the `JETPACK_HOME` environment variable (legacy `CORENODE_HOME` is also recognized as a fallback). On first startup, `JetPackPaths::init_dirs()` automatically migrates legacy `CoreNode` directories if present and enforces mode `0700` on Unix directories.

```text
<JETPACK_ROOT>/
├── config/
│   ├── daemon.toml              # Daemon bind address, port, logging, and [diagnostics] configuration
│   ├── paired_clients.db        # ChaCha20-Poly1305 AEAD encrypted SQLite DB (paired clients, authorized_volumes, settings)
│   └── pairing.ipc              # Local IPC socket/metadata for single-instance URI forwarding
├── logs/
│   ├── daemon.log               # Persistent UTF-8 tracing log (redacted in diagnostic exports)
│   └── jetpack-diagnostics-*.zip# Optional user-exported sanitized diagnostic bundles
├── blobs/
│   └── sha256/
│       ├── <hex>                # Content-Addressable OCI layer/config/manifest blobs
│       └── <hex>.unpacked/      # Tar-Slip-verified unpacked layer directories
├── runtimes/
│   ├── uv/                      # Portable uv binary
│   ├── python/                  # Managed python-build-standalone distributions
│   └── <name>-<version>/bin/    # Verified shared native runtimes (e.g., ffmpeg-9.0.2)
├── apps/
│   └── <app-id>/<version>/      # Deduplicated app bundles (hardlinks / APFS clones) + .venv
├── workspaces/
│   └── job_<uuid>/              # Ephemeral per-job sandbox RW directory + ipc.sock
└── cache/
    └── uv/                      # Shared zero-duplication wheel cache (UV_CACHE_DIR, mode 0700)
```

## Monorepo Crate & Package Layout

| Path | Role |
| :--- | :--- |
| `crates/jetpack-proto` | `wasm32`-compatible crate for `HybridFrame`, `X25519`/`Ed25519` handshake, `ChaCha20-Poly1305` cipher, pairing URIs, and `HardwareProfile` / control-plane schemas |
| `crates/jetpack-common` | `AppManifest` (`app.toml`) strict parser/validator, `DaemonConfig`, `JetPackPaths`, and shared errors |
| `crates/jetpack-daemon` | Tray agent, `127.0.0.1:9470` WS/Control Center server, ChaCha20-Poly1305 encrypted SQLite store (`rusqlite` `bundled`), pure-Rust TLS (`rustls-tls`), OCI/Python/runtime provisioners, OS sandboxes, and CLI tools |
| `crates/jetpack-wasm` | `wasm-bindgen` browser SDK (`WasmClientIdentity`, `JetPackWasmClient`) |
| `web/` | Embedded Control Center UI (`web/dist/`) and `@jetpack/client` TypeScript SDK (`web/packages/jetpack-client`) |
| `sdks/python/jetpack_sdk` | Lightweight Python worker IPC library (`JetPackClient`, `HybridFrame`, zero-copy reader) |
