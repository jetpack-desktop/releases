# Volumes & Userspace Networking

Sandboxed workers start with zero access to user files and zero direct access to the host network stack. JetPack provides two explicit, auditable mechanisms when a worker needs user folders or outbound APIs.

## 1. User-Directed Host Folders (`[volumes.<name>]`)

Never hardcode or request absolute host filesystem paths in `app.toml` or from browser JavaScript. Instead, declare logical volume names and access modes in `app.toml`:

```toml
[volumes.media_input]
mode = "read-only"

[volumes.media_output]
mode = "read-write"
```

### How Resolution & Persistence Work

1. **Native OS Picker (`rfd`)**: On first launch (`app.launch`), `jetpack-daemon` prompts the human user via the native OS folder picker (`Finder` / `Explorer` / `GTK Portal`) for each unconfigured volume. If the user cancels, launch aborts with `JetPackError::VolumeNotAuthorized`.
2. **Encrypted Store Caching (`ChaCha20-Poly1305`)**: Selected folders are persisted in `paired_clients.db` (`authorized_volumes(app_id, volume_name, access_mode, host_path, updated_at)`). Subsequent launches reuse the stored directory without re-prompting unless the folder was deleted/moved or the user/client requests a reset (`reset_volumes: true` or `"app.volumes.reset"`).
3. **Browser Privacy (`AppInfo`)**: The browser only receives `{ volume_name, folder_name, is_configured }` (e.g., `folder_name: "Clips"`). Full host paths are **never** sent over WebSockets.
4. **Zero Client Trust**: Any absolute host path passed by an untrusted browser in `AppLaunchRequest` is ignored/rejected.

### Accessing Mounted Volumes in Python Workers

Inside the sandbox, `jetpack-daemon` injects one environment variable per volume using the pattern `JETPACK_VOL_<UPPERCASE_NAME>`:

```python
import os
from pathlib import Path

input_dir = Path(os.environ["JETPACK_VOL_MEDIA_INPUT"])
output_dir = Path(os.environ["JETPACK_VOL_MEDIA_OUTPUT"])

# Read-only mount: reading succeeds; writing raises PermissionError / EPERM
files = sorted(p.name for p in input_dir.iterdir() if p.is_file())

# Read-write mount: writing processed artifacts succeeds
out_file = output_dir / "processed.mp4"
```

> **Note:** Volumes declared with `mode = "read-only"` are enforced as read-only by the OS kernel sandbox (`AppContainer` NTFS DACL, `Seatbelt`, or `bwrap --ro-bind` + `Landlock`), even if your user account owns the folder.

## 2. Outbound Networking via Userspace Proxy

Because workers run without direct network interfaces (`CLONE_NEWNET` on Linux, `(deny default)` on macOS, restricted capabilities on Windows), declare required remote endpoints in `[permissions].network_allowlist`:

```toml
[permissions]
network_allowlist = [
  "huggingface.co:443",
  "*.huggingface.co:443",
]
```

### Using the Proxy in Python Workers

`jetpack-daemon` automatically sets `JETPACK_PROXY_ENDPOINT`, `HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY` inside the sandboxed process environment. `jetpack_sdk.JetPackClient` exposes `client.proxy_endpoint`:

```python
import urllib.request
from jetpack_sdk import JetPackClient

with JetPackClient() as client:
    proxy_url = client.proxy_endpoint
    if proxy_url:
        handler = urllib.request.ProxyHandler({
            "http": proxy_url,
            "https": proxy_url,
        })
        opener = urllib.request.build_opener(handler)
        with opener.open("https://huggingface.co/api/models") as resp:
            data = resp.read()
```

Requests to any `host:port` not matching `network_allowlist` (or targeting loopback daemon ports) are blocked immediately with `403 Forbidden` by the in-daemon Rust proxy and recorded in the security audit log.
