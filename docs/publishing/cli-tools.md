# CLI Tools Reference

`jetpack-daemon` ships with built-in developer, packaging, catalog signing, and diagnostic subcommands (`crates/jetpack-daemon/src/main.rs` and `dev_cli.rs`).

## Developer & Publisher Commands

### `--init-app <target_dir>`

Scaffolds a ready-to-run starter Python worker project in `<target_dir>` (refuses to overwrite an existing `app.toml`):

```bash
jetpack-daemon --init-app ./workers/my-ocr-worker
```

Creates:
- `app.toml` — Validated starter manifest using a non-official `com.dev.<slug>` ID (`com.dev.my-ocr-worker`).
- `worker.py` — Executable (`0755` on Unix) Python worker using `jetpack_sdk.JetPackClient`.
- `pyproject.toml` — Project metadata (`requires-python = ">=3.12"`, `jetpack-sdk` dependency).
- `README.md` — Project-specific validation, local install, and packaging commands.

### `--validate-manifest <path>`

Parses an `app.toml` file with `#[serde(deny_unknown_fields)]` and runs all semantic and security checks:

```bash
jetpack-daemon --validate-manifest ./workers/my-ocr-worker/app.toml
```

### `--install-local-app <source_dir>`

Validates, packages, and installs a local developer worker directly into `<root>/blobs/sha256/` and `<root>/apps/<app-id>/<version>/` in unverified developer mode (`is_verified = false`):

```bash
jetpack-daemon --install-local-app ./workers/my-ocr-worker
```

- Blocks official `SignedAppCatalog` IDs (`APP_SPOOFING_DETECTED`).
- Displays the app with an `UNVERIFIED / LOCAL DEV` badge in Control Center and restricts WebSocket origins to `127.0.0.1` / `localhost`.

### `--package-app <source_dir> --out <bundle_dir> [--oci-ref <ref>]`

Packages a validated worker directory into a standards-compliant **OCI Image Layout v1.0.0** directory and outputs `manifest_sha256` plus a `CatalogAppEntry` JSON snippet:

```bash
jetpack-daemon \
  --package-app ./workers/my-ocr-worker \
  --out ./dist/my-ocr-worker-oci \
  --oci-ref ghcr.io/your-org/my-ocr-worker:0.1.0
```

Automatically strips `*.key`, `*.pem`, `*.secret`, `jetpack-root-signing*`, `.git/`, `.venv/`, and `__pycache__/` so secrets cannot leak into published layers.

## Catalog Operator Commands

### `--generate-catalog-keypair --out-priv <path>`

Generates an `Ed25519` root keypair using `OsRng`:

```bash
jetpack-daemon --generate-catalog-keypair --out-priv ~/.secrets/jetpack-root-signing.key
```

- Writes the 32-byte seed (64 lowercase hex characters) atomically (`create_new(true)`) with mode `0600` on Unix.
- Prints only the public key hex and the Rust `CATALOG_VERIFY_PUBKEY` literal to stdout.

### `--sign-catalog <catalog_json_path> [--key <priv_key_path>]`

Canonicalizes `SignedAppCatalog`, signs it with `Ed25519` (reading `--key` or `JETPACK_SIGNING_KEY`), writes `ed25519_signature` atomically, and immediately re-verifies the file from disk:

```bash
jetpack-daemon --sign-catalog crates/jetpack-daemon/assets/catalog.signed.json --key ~/.secrets/jetpack-root-signing.key
```

## Runtime, Inspection & Diagnostic Flags

| Flag | Purpose |
| :--- | :--- |
| `--headless` | Run `jetpack-daemon` without a desktop system tray icon (CI / server). |
| `--seed-core-apps` | Package and pre-install curated core workers from `examples/` (e.g., slim release bundle `examples/ffmpeg-media-converter`, excluding `.venv`, `__pycache__`, `tests`, and media files) into CAS and `<root>/apps/`. |
| `--export-diagnostics [--out <path>]` | Collect a sanitized `.zip` diagnostic bundle (`diagnostics.json` + redacted `daemon.log` tail) and write it to `<path>` or `<root>/logs/jetpack-diagnostics-<timestamp>.zip`. |
| `--print-hardware-profile` | Probe CPU topology, RAM/unified memory, and GPUs (`NVML`, `Vulkan`, `DX12`, `Metal`). |
| `--list-paired-clients` | List approved origins and client UUIDs stored in `paired_clients.db`. |
| `--list-installed-apps` | Scan `<root>/apps/` and print discovered manifests and versions. |
| `--register-uri-scheme` | Register `jetpack://` and `corenode://` custom URL schemes in user space. |
| `--generate-test-pair-uri` | Print a deterministic test `jetpack://pair` URI and SHA-256 fingerprint. |
| `--test-ws-client` | Connect to a running daemon (`127.0.0.1:9470`) to verify PNA, handshake, and `system.echo` (supports `--send-json` and `--origin`). |
| `--ws-smoke-test` | Run offline end-to-end WebSocket security and `hardware.get_profile` smoke test. |
| `--oci-smoke-test` | Run offline OCI CAS, SHA-256 verification, and hardlink/APFS clone smoke test. |
| `--python-smoke-test` | Run offline hermetic `uv` + `python-build-standalone` provisioner smoke test. |
| `--sandbox-smoke-test` | Run offline OS native kernel sandbox (`AppContainer` / `Seatbelt` / `bwrap+Landlock`) smoke test. |
| `--worker-ipc-smoke-test` | Run offline sandboxed worker IPC, userspace proxy, and lifecycle cleanup smoke test. |
| `--full-e2e-smoke-test` | Run the full end-to-end orchestrator, sandbox, GPU worker, and WebSocket integration test. |
