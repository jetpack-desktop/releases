# Native Portable Runtimes

Workers often depend on heavy native binaries such as `ffmpeg`, `ffprobe`, `llama.cpp`, or `postgres`. Installing them globally violates **Zero System Pollution**. Instead, `jetpack-daemon` provides `RuntimeProvisioner` (`crates/jetpack-daemon/src/worker/runtimes.rs`) and the OCI Content-Addressable Storage (CAS) manager (`crates/jetpack-daemon/src/oci.rs`).

## 1. Declaring Runtimes in `app.toml`

You can declare either an OCI-backed runtime or per-platform portable HTTPS archives with mandatory `sha256` digests. Example from `examples/ffmpeg-media-converter/app.toml`:

```toml
[runtimes.ffmpeg]
version = "9.0.2"
target_dir = "runtimes/ffmpeg-9.0.2"

[runtimes.ffmpeg.platforms."darwin/arm64"]
url = "https://github.com/Tyrrrz/FFmpegBin/releases/download/9.0.2/ffmpeg-osx-arm64.zip"
digest = "sha256:7d22a2893ccd761c3b4214165975e306d6c85c1de188f79f7e2723070c0006e4"

[runtimes.ffmpeg.platforms."linux/amd64"]
url = "https://github.com/Tyrrrz/FFmpegBin/releases/download/9.0.2/ffmpeg-linux-x64.zip"
digest = "sha256:2483332318255c1001facbc6a6bf91941e5f35651bf8b7d4cfd768e1da18567f"

[runtimes.ffmpeg.platforms."windows/amd64"]
url = "https://github.com/Tyrrrz/FFmpegBin/releases/download/9.0.2/ffmpeg-windows-x64.zip"
digest = "sha256:bcc61c7027eefbed7d87af0a619ce8e6c4a5c5f8bb0d31a2acec8fe7ed749850"
```

## 2. Provisioning Pipeline & Security Checks

During `"app.pull"` and right before `launch_job`, `RuntimeProvisioner`:

1. **Checks Cache**: Inspects `<root>/runtimes/<name>-<version>/bin/`. If already materialized, skips network downloads.
2. **Downloads Target Platform Artifact**: Fetches the platform-matching OCI layer or HTTPS archive (`.tar.gz`, `.tgz`, `.zip`) into a temporary staging file.
3. **Verifies SHA-256 Digest**: Computes streaming `SHA-256` and compares against the manifest's `sha256:<64-hex>`. Any mismatch deletes the staging file immediately and fails with `JetPackError::DigestMismatch`.
4. **Tar-Slip / Zip-Slip Safe Extraction**: Rejects any archive entry containing `..`, absolute paths, or escaping symlinks/hardlinks, and sets `0o755` executable permissions on Unix binaries.
5. **Zero-Duplication Linking**: Links shared runtime trees and app bundles using `std::fs::hard_link` (shared inode / NTFS file record) or `libc::clonefile` (macOS APFS Copy-on-Write clones) so multiple apps share multi-gigabyte weights and tools without duplicating disk blocks.

## 3. Calling Native Binaries Inside the Sandbox

When `jetpack-daemon` launches the sandboxed worker, `<root>/runtimes/<name>-<version>/bin` is prepended to the **worker's** isolated `PATH` (read-only inside the sandbox), while the host OS `PATH` remains completely untouched.

Your worker can invoke `ffmpeg` directly via `subprocess`:

```python
import shutil
import subprocess

ffmpeg_bin = shutil.which("ffmpeg")
if not ffmpeg_bin:
    raise RuntimeError("ffmpeg runtime was not provisioned into sandbox PATH")

# Example: Apple Silicon VideoToolbox or CPU transcode inside sandbox
cmd = [
    ffmpeg_bin,
    "-y",
    "-i", input_path,
    "-c:v", "h264_videotoolbox",
    output_path,
]
subprocess.run(cmd, check=True)
```

For full reference code, see `examples/ffmpeg-media-converter/transcoder.py` and `inspector.py`.
