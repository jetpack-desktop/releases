# Store Submission & Catalog Signing

This guide covers packaging a validated worker as a multi-arch OCI Image Layout bundle, pushing it to an OCI registry (`ghcr.io`, Docker Hub, etc.), and signing `catalog.signed.json` as a JetPack platform operator.

## 1. Developer Workflow: Packaging & Pushing to OCI

### Step 1: Validate Your Manifest

Ensure `app.toml` passes strict schema and security checks:

```bash
jetpack-daemon --validate-manifest ./workers/my-ocr-worker/app.toml
```

### Step 2: Package an OCI Image Layout v1.0.0 Bundle

```bash
jetpack-daemon \
  --package-app ./workers/my-ocr-worker \
  --out ./dist/my-ocr-worker-oci \
  --oci-ref ghcr.io/your-org/my-ocr-worker:0.1.0
```

Output bundle structure:

```text
dist/my-ocr-worker-oci/
├── oci-layout               # { "imageLayoutVersion": "1.0.0" }
├── index.json               # Multi-arch OciImageIndex matching [hardware].architectures
└── blobs/sha256/
    ├── <layer_sha256>       # Deterministic .tar.gz with POSIX '/' paths, 0755 entrypoints
    ├── <config_sha256>      # OCI image config JSON with rootfs.diff_ids & io.jetpack.app.* labels
    ├── <manifest_sha256>... # Per-platform OciImageManifest blobs
    └── <index_sha256>       # Multi-arch OciImageIndex blob (when architectures.len() > 1)
```

The command prints `manifest_sha256` and a ready-to-edit `CatalogAppEntry` JSON block to stdout.

### Step 3: Push with `oras` & Verify Digest

Push the OCI Image Layout directory to your registry:

```bash
oras cp --from-oci-layout ./dist/my-ocr-worker-oci:latest ghcr.io/your-org/my-ocr-worker:0.1.0
```

> **Important:** Confirm that the pushed remote manifest digest matches `manifest_sha256`. If your registry or push tool re-serializes the manifest or index, update `manifest_sha256` in `CatalogAppEntry` to match the exact remote digest before signing the catalog.

Populate `category`, `icon_svg`, and `allowed_origins` (for example `["https://studio.example.com"]`) in the `CatalogAppEntry` JSON object.

---

## 2. Platform Operator Workflow: Key Hygiene & Catalog Signing

### Secret Hygiene & `.gitignore` Protections

Never commit private signing keys, PEM files, or seed material to source control. The repository `.gitignore` blocks:

```text
*.key
*.pem
*.secret
jetpack-root-signing*
```

Verify ignore rules before storing local test keys:

```bash
git check-ignore -v jetpack-root-signing.key test.pem catalog.secret
```

### Generating the Ed25519 Root Keypair

```bash
jetpack-daemon \
  --generate-catalog-keypair \
  --out-priv ~/.secrets/jetpack-root-signing.key
```

Security guarantees:
- **Atomic creation**: Uses `OpenOptions::create_new(true)` and refuses to overwrite existing files.
- **Strict file permissions**: Sets `0600` (`rw-------`) on macOS and Linux. On Windows, store the key under `%USERPROFILE%\.secrets\` with user-only NTFS ACLs (`icacls <path> /inheritance:r /grant:r "%USERNAME%:F"`).
- **Zero-exposure output**: The private seed is zeroized in memory (`zeroize::Zeroizing`) and never printed to stdout.

### Rotating `CATALOG_VERIFY_PUBKEY`

1. Store the production seed in an offline hardware vault (YubiKey, 1Password, HashiCorp Vault, or AWS KMS/Secrets Manager).
2. Paste the printed `[u8; 32]` array literal into `CATALOG_VERIFY_PUBKEY` inside `crates/jetpack-daemon/src/catalog.rs`.
3. Re-sign `crates/jetpack-daemon/assets/catalog.signed.json`.
4. Run `cargo test -p jetpack-daemon catalog::tests` to confirm `embedded_signed_catalog_verifies_against_platform_pubkey` passes, then rebuild `make release-daemon`.

### Signing `catalog.signed.json`

Sign locally using `--key` or in CI/CD via `JETPACK_SIGNING_KEY`:

```bash
# Option A: Sign using a local private seed file (64-char hex or raw 32-byte binary)
jetpack-daemon \
  --sign-catalog crates/jetpack-daemon/assets/catalog.signed.json \
  --key ~/.secrets/jetpack-root-signing.key

# Option B: Sign in CI/CD using an encrypted masked secret environment variable
export JETPACK_SIGNING_KEY="$(cat ~/.secrets/jetpack-root-signing.key)"
jetpack-daemon --sign-catalog crates/jetpack-daemon/assets/catalog.signed.json
unset JETPACK_SIGNING_KEY
```

`--sign-catalog` parses the catalog against `SignedAppCatalog` (`#[serde(deny_unknown_fields)]`), computes the canonical `Ed25519` signature over `SignedAppCatalog::canonical_payload_bytes()`, writes `ed25519_signature` atomically, and re-verifies the file from disk before exiting `0`.
