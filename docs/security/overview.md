# Security Overview

JetPack exposes local native hardware and OS-level compute to web applications running inside untrusted browser origins. Because a local daemon listening on `127.0.0.1` is an attractive target for malicious websites, DNS rebinding, browser extensions, and supply-chain tampering, JetPack enforces defense-in-depth across four distinct security boundaries.

## Threat Model & Trust Boundaries

| Boundary | Threat Addressed | Enforcement Mechanism |
| :--- | :--- | :--- |
| **1. Browser <-> Daemon Transport** | Cross-site WebSocket hijacking, DNS rebinding, rogue local tabs, plaintext inspection | Strict `127.0.0.1` bind, HTTP Upgrade `Origin` allowlist + W3C PNA, Out-of-Band `jetpack://pair` + native OS dialog, `X25519` + `Ed25519` handshake, `ChaCha20-Poly1305` encrypted framing, `1003` close on JSON/text frames |
| **2. At-Rest Credential & Consent Store** | Local unprivileged malware or SQLite tools reading paired keys or authorized folder paths | 256-bit `ChaCha20-Poly1305` (AEAD) encrypted SQLite container (`paired_clients.db`) with master key stored exclusively in OS Vault (`DPAPI` / `Keychain` / `Secret Service`), Unix `0700` / `0600` directory and file permissions |
| **3. Daemon <-> Native Worker Sandbox** | Malicious or compromised AI/media worker reading user documents (`~/Documents`, `~/.ssh`), spawning hidden background processes, or exfiltrating data over the internet | Default-deny OS kernel sandboxes (`Windows AppContainer + Job Objects`, `macOS Seatbelt`, `Linux bwrap + Landlock LSM`), user-selected `[volumes]` via native OS `rfd` picker, and an in-daemon Userspace Network Proxy filtered by `permissions.network_allowlist` |
| **4. App Store & Supply Chain** | Tampered catalog entries, App ID spoofing (`io.jetpack.*`), registry redirection, Tar-Slip extraction, linker injection (`LD_PRELOAD`) | Compiled-in `CATALOG_VERIFY_PUBKEY` (`Ed25519`), `manifest_sha256` pinning, per-app `allowed_origins` enforcement, SHA-256 CAS verification, Tar-Slip rejection, and `#[serde(deny_unknown_fields)]` manifest validation |

## Architectural Security Guarantees

### Rust as the Sole Gatekeeper

Browser code (`@jetpack/client` / `jetpack-wasm`) **never** opens sockets or named pipes directly to Python or C++ workers. All external traffic terminates inside `jetpack-daemon` (`crates/jetpack-daemon/src/ws_server.rs`), which:
1. Refuses to bind to `0.0.0.0`, `::`, or any non-loopback IP address before opening a TCP listener.
2. Validates the normalized HTTP `Origin` header on both `OPTIONS` Private Network Access preflights and WebSocket `GET` upgrades against `paired_clients.db` (or the daemon's own Control Center origin `http://127.0.0.1:<port>`). Rejects unknown or missing origins with `HTTP/1.1 403 Forbidden`.
3. Enforces a 5-second post-upgrade cryptographic `ClientHello` handshake binding the HTTP `Origin` to `ClientHello.origin` and the paired `Ed25519` public key.
4. Enforces per-application `Origin` authorization before `"app.launch"` or forwarding any frame with `target_worker` set.

### Zero Client Trust for Host Paths & Privileges

- Web clients **cannot** pass absolute host filesystem paths to workers; any path in `AppLaunchRequest` is ignored/rejected. Host folders for `[volumes.<name>]` are selected exclusively by the human user through the native OS folder dialog (`rfd`).
- Web clients **cannot** bypass `SignedAppCatalog` verification via `"settings.set"` (`developer_mode = true` never enables unverified network `"app.pull"`).
- Local developer apps (`--install-local-app`) are restricted strictly to non-official IDs (never shadowing `SignedAppCatalog` entries) and can only be invoked from loopback origins (`127.0.0.1` / `localhost`).

## Detailed Security Audit Sections

- [Pairing & Cryptography](/security/pairing-and-crypto): Out-of-Band `jetpack://pair`, `X25519` + `Ed25519` handshake, `ChaCha20-Poly1305` framing, and `ChaCha20-Poly1305` at-rest store + OS Vault key management.
- [OS Kernel Sandboxing](/security/os-sandboxing): Platform-by-platform kernel primitives (`AppContainer`, `Seatbelt`, `bwrap` + `Landlock LSM`) and Userspace Network Proxy filtering.
- [Signed Catalog & Anti-Spoofing](/security/signed-catalog): `Ed25519` root key verification, `manifest_sha256` pinning, and per-app `Origin` isolation.
