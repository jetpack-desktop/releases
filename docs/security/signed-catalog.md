# Signed Catalog & Anti-Spoofing

JetPack enforces a hard security boundary between **Verified App Store Catalog** applications and **Local Unverified Developer** applications (`crates/jetpack-daemon/src/catalog.rs`).

## 1. Embedded Platform Root Key (`CATALOG_VERIFY_PUBKEY`)

`jetpack-daemon` compiles in the platform's 32-byte `Ed25519` verifying public key (`CATALOG_VERIFY_PUBKEY`) alongside the embedded base `SignedAppCatalog` (`crates/jetpack-daemon/assets/catalog.signed.json`).

- Outside `#[cfg(test)]`, `CATALOG_VERIFY_PUBKEY` is strictly immutable and cannot be overridden by `daemon.toml`, environment variables, or WebSocket control-plane opcodes.
- Before trusting any catalog entry (remote, cached, or embedded), `SignedAppCatalog::from_signed_json_and_verify` computes the canonical payload bytes (`SignedAppCatalog::canonical_payload_bytes()`, covering `version`, ordered `apps` entries, and `coming_soon`) and verifies `ed25519_signature` using `ed25519-dalek`.
- Any tampering with `oci_reference`, `manifest_sha256`, `allowed_origins`, `coming_soon`, `version`, or `min_vram_mb`—or a signature produced by an untrusted keypair—fails immediately with `JetPackError::CatalogSignatureInvalid`.

## 2. Remote Catalog Refresh, Verified Caching & Offline Fallback

`DaemonConfig` (`<root>/config/daemon.toml`) configures an optional top-level `catalog_url` defaulting to `https://raw.githubusercontent.com/jetpack-io/jetpack/main/crates/jetpack-daemon/assets/catalog.signed.json` (setting `catalog_url = ""` disables remote fetches cleanly for air-gapped setups). Non-empty URLs must use `https://` (or loopback `http://127.0.0.1` / `localhost` / `::1` for local testing).

When an authenticated client requests `"catalog.get"`:

1. **Bounded HTTPS Fetch**: The daemon asynchronously fetches `catalog.signed.json` with a strict **3-second** timeout and a 2 MiB response size cap via `reqwest` (`rustls-tls`).
2. **Signature & Anti-Rollback Check**: The remote payload must verify against `CATALOG_VERIFY_PUBKEY` and have `remote.version >= embedded.version`.
3. **Atomic Cache Persistence**: Validated catalogs are atomically written to `<root>/config/catalog.cached.json` (`0600` permissions on Unix).
4. **Transparent Fallback**: If the network is unreachable, times out, returns an error, or presents a tampered/rolled-back payload, the existing cache is **never** overwritten and the daemon transparently falls back to the last verified `<root>/config/catalog.cached.json` (if valid and `cached.version >= embedded.version`) or the compiled-in `EMBEDDED_SIGNED_CATALOG_JSON`.

## 3. Verified Network Pulls, `coming_soon` & Digest Pinning

When an authenticated client invokes `"app.pull"`:

1. **Catalog-Only Network Pulls**: The daemon resolves `app_id` or `oci_reference` exclusively against the active verified `SignedAppCatalog`. Any request targeting an unlisted image returns `"app.error"` with code `UNVERIFIED_APP_BLOCKED` without contacting any remote registry.
2. **`coming_soon` Availability Enforcement**: Announced future catalog entries marked `coming_soon: true` (rendered in the Control Center Store with a non-interactive **Coming Soon** badge) are rejected on `"app.pull"` with `PROVISIONING_FAILED` before contacting any OCI registry.
3. **No Browser Privilege Escalation**: Even if `"settings.set"` toggles `developer_mode = true`, browser WebSocket sessions are **never** permitted to pull unverified OCI references from the network.
4. **Immutable Digest & Reference Pinning**: Client-supplied registry URLs, tags, or digest overrides are ignored. The daemon pulls strictly from `CatalogAppEntry.oci_reference` and verifies that the resolved OCI manifest digest matches `CatalogAppEntry.manifest_sha256`.
5. **Inner Manifest App ID Verification**: After unpacking the OCI layer (with Tar-Slip path traversal checks), the daemon verifies that `app.toml`'s `[package].id` matches `CatalogAppEntry.app_id`. Mismatches are rejected with `APP_SPOOFING_DETECTED` or `PROVISIONING_FAILED` before materializing into `<root>/apps/`.

## 4. Anti-Spoofing for Local Developer Apps vs. Curated Offline Seeding

Developers can install custom local workers on their own machine using the CLI (`jetpack-daemon --install-local-app <dir>`):

- **Official ID Protection**: If a local app's `app.toml` attempts to use an `app_id` reserved in `SignedAppCatalog` (such as `io.jetpack.media-converter`), `--install-local-app` rejects it with `APP_SPOOFING_DETECTED`.
- **Verified Provenance Tracking**: Apps installed via verified catalog `"app.pull"`—or seeded strictly from the daemon's curated `examples/` allowlist (`--seed-core-apps` / first-run hook guarded by `<root>/config/.core-apps-seeded`)—carry verified provenance (`is_verified = true` in `AppInfo`). Custom local apps always report `is_verified = false` and display a yellow `UNVERIFIED / LOCAL DEV` badge in the Control Center and system tray.

## 5. Per-Application WebSocket `Origin` Authorization

Having a paired WebSocket session does **not** grant a web origin access to every installed worker on the user's machine. Before `"app.launch"` or forwarding any `HybridFrame` with `target_worker` set, `jetpack-daemon` checks:

| App Provenance | Authorized WebSocket `Origin`s | Unauthorized Result |
| :--- | :--- | :--- |
| **Verified Catalog App** (`is_verified = true`) | Normalized origins listed in `CatalogAppEntry.allowed_origins` **OR** the embedded Control Center origin (`http://127.0.0.1:<port>`) | Rejected with `"app.error"` code `ORIGIN_NOT_AUTHORIZED_FOR_APP` |
| **Local Developer App** (`is_verified = false`) | Loopback HTTP origins only (`http://127.0.0.1[:port]`, `http://localhost[:port]`) | Rejected with `"app.error"` code `ORIGIN_NOT_AUTHORIZED_FOR_APP` |

Remote paired origins (e.g. `https://app.example.com`) can never launch or send IPC frames to unverified local-dev workers, nor can one catalog app's origin invoke another catalog app's worker unless explicitly authorized in `allowed_origins`.
