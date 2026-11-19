# Pairing & Cryptography

JetPack protects the local `127.0.0.1:9470` WebSocket channel with Out-of-Band (OOB) human authorization, mutual asymmetric authentication, ephemeral forward secrecy, and encrypted at-rest key storage.

## 1. Out-of-Band Pairing (`jetpack://pair`)

Standard browser CORS is insufficient to protect a localhost daemon against DNS rebinding or rogue browser tabs. Every external origin must first pair out-of-band:

1. **Identity Generation (`WasmClientIdentity`)**:
   - In the browser, `jetpack-wasm` generates a random `UUIDv4` `client_id` and two 32-byte seeds (`Ed25519` signing key + companion `X25519` static key) using `getrandom`, persisted in `window.localStorage` (`jetpack_client_id`, `jetpack_ed25519_seed`, `jetpack_x25519_seed`).
2. **Pairing URI Construction**:
   - The client formats a deep link:
     ```text
     jetpack://pair?client_id=<uuid>&pubkey=<urlsafe-base64>&origin=<normalized-origin>
     ```
   - `crates/jetpack-proto/src/pairing.rs` validates that `client_id` is an RFC 4122 UUID, `pubkey` decodes to 32 bytes (`Ed25519`) or 64 bytes (`Ed25519` + `X25519`), and `origin` is a valid `https://` origin or loopback `http://127.0.0.1` / `http://localhost`. Plain `http://` remote origins are rejected with `PairingUriError::InvalidOrigin`. *(Legacy `corenode://pair` URIs remain accepted for backwards compatibility.)*
3. **Single-Instance IPC Dispatch**:
   - When the OS launches `jetpack-daemon` via the custom URI handler (CLI arguments on Windows/Linux or `AppleEvent` on macOS), the secondary process pings `<root>/config/pairing.ipc` (`PING <token>`). If a primary daemon is running, it forwards the URI over local IPC and exits with status `0`.
4. **Native OS Confirmation Dialog**:
   - On the main UI thread, `jetpack-daemon` displays a native OS modal dialog (`NSAlert` on macOS, `TaskDialog` on Windows, `GTK/Portal` on Linux via `rfd`) showing:
     - Requesting web `origin`
     - `client_id` UUID
     - Deterministic `SHA-256` public key fingerprint (`SHA256:XX:YY:...`)
   - Only clicking **Yes / Allow** persists the client in `paired_clients.db`. Dismissing or clicking **No** aborts without writing to disk.

## 2. Encrypted At-Rest Storage (`ChaCha20-Poly1305` + OS Secret Vault)

Approved clients, authorized folder mounts (`authorized_volumes`), and daemon settings live in `<root>/config/paired_clients.db`, encrypted at rest as a **pure-Rust `ChaCha20-Poly1305` (AEAD)** container over serialized SQLite (`rusqlite` `bundled`, zero OpenSSL dependency).

- **Master Key & AEAD Envelope**: On first run, `OsKeyringStore` (`crates/jetpack-daemon/src/pairing.rs`) generates 32 cryptographically random bytes (`256-bit` key). Every write generates a fresh 96-bit CSPRNG nonce (`getrandom`), authenticates the `JPKDB01\0` header + nonce as AAD, and atomically replaces `paired_clients.db`.
- **OS Vault Storage (`keyring`)**: The master key is never stored in plaintext config files. It is stored exclusively inside the host OS credential vault under service `io.jetpack.daemon` (with automatic migration from legacy `io.corenode.daemon`):
  - **Windows**: Windows Credential Manager / DPAPI
  - **macOS**: macOS Keychain
  - **Linux**: FreeDesktop Secret Service (`gnome-keyring` / `KWallet`)
- Attempting to inspect `paired_clients.db` with standard `sqlite3` without the vault key fails immediately with `Error: file is not a database`.

## 3. Authenticated `X25519` + `Ed25519` Session Handshake

Every WebSocket connection to `ws://127.0.0.1:9470` must pass two layers before any application data is processed:

1. **HTTP Upgrade & Private Network Access (PNA)**:
   - On `OPTIONS` preflight and `GET` WebSocket Upgrade, `ws_server.rs` normalizes the HTTP `Origin` header and verifies it against `paired_clients.db` (or the daemon's own Control Center origin `http://127.0.0.1:<port>`).
   - Unauthorized or missing origins receive `HTTP/1.1 403 Forbidden`.
   - Authorized origins receive `Access-Control-Allow-Origin: <origin>`, `Access-Control-Allow-Private-Network: true`, and `Vary: Origin`.
2. **Post-Upgrade `ClientHello` / `ServerHello` (`crates/jetpack-proto/src/handshake.rs`)**:
   - Immediately after `101 Switching Protocols`, the client has **5 seconds** (`DEFAULT_HANDSHAKE_TIMEOUT`) to send a binary `ClientHello` envelope:
     ```text
     [Magic "CNOD" (4 B)] + [Version u16 LE (2 B)] + [MsgPack ClientHello]
     ```
     *(Wire magic `"CNOD"` and transcript signing domain `b"CORENODE-HANDSHAKE-V1"` are preserved for protocol compatibility.)*
   - `ClientHello` contains `client_id`, `origin`, a fresh ephemeral `X25519` public key (`32 B`), a random `client_nonce` (`32 B`), and a 64-byte `Ed25519` signature over the transcript.
   - `ServerHandshake` verifies:
     1. `client_id` exists in `paired_clients.db`.
     2. `ClientHello.origin` matches **both** the stored `origin` in `paired_clients.db` and the HTTP Upgrade `Origin` header (preventing cross-client origin spoofing).
     3. The `Ed25519` signature is valid under the stored public key.
   - The daemon generates its own ephemeral `X25519` keypair and `server_nonce`, computes the ECDH shared secret, and derives three 256-bit secrets via **HKDF-SHA256** bound to the full handshake transcript:
     - `client_to_daemon_key` (`32 B`)
     - `daemon_to_client_key` (`32 B`)
     - `confirm_key` (`32 B`) + `session_id`
   - The daemon responds with `ServerHello` containing an `HMAC-SHA256` transcript confirmation tag (`confirm_key`), and both sides zeroize ephemeral private keys and raw shared secrets in memory (`zeroize::Zeroize`).

## 4. `ChaCha20-Poly1305` Streaming Frames & Replay Protection

After `ServerHello`, all WebSocket messages are authenticated and encrypted with `ChaCha20-Poly1305` (RFC 8439) inside `SessionCipher` (`crates/jetpack-proto/src/framing.rs`):

```text
+-------------------------------+----------------------------------------+------------------------+
| seq: uint64 LE (8 B, AAD)     | Ciphertext of Plaintext HybridFrame    | Poly1305 Tag (16 B)    |
+-------------------------------+----------------------------------------+------------------------+
```

- **Directional 96-bit Nonces**:
  - Client -> Daemon: `b"C2D\0" || seq.to_le_bytes()` (`4 B + 8 B = 12 B`)
  - Daemon -> Client: `b"D2C\0" || seq.to_le_bytes()` (`4 B + 8 B = 12 B`)
- **Associated Data (AAD)**: The 8-byte little-endian `seq` is passed as AAD to AEAD encryption/decryption.
- **Strict Anti-Replay Enforcement**: Both directions maintain independent `u64` sequence counters starting at `0`. Any frame arriving with an out-of-order, duplicated, or skipped `seq` is rejected with `ProtoError::InvalidSequenceNumber` without advancing the counter, and the WebSocket connection is closed immediately.
- **Strict Binary-Only Policy**: Sending any post-handshake WebSocket text/JSON frame (`Message::Text`) causes `jetpack-daemon` to immediately close the connection with `1003 Unsupported Data`.
