# JetPack — Local Compute & Native App Orchestrator

**JetPack** is a lightweight cross-platform desktop orchestrator (~5–10 MB native tray agent) that lets web applications run local AI, media, and compute workloads at native GPU speed—**without virtual machines, Docker, WSL2, or administrator privileges**.

---

## Key Highlights

- **Zero-VM Execution**: Runs native host binaries (`Mach-O`, `PE/.exe`, `ELF`) and isolated Python environments directly on your hardware with native GPU access (**Apple Metal / MPS / MLX**, **NVIDIA CUDA**, **Vulkan**, **DirectML**, **ROCm**).
- **No-Admin / Userspace Only**: Installs and stores all data strictly inside your user profile (`~/Library/Application Support/JetPack`, `%APPDATA%\JetPack`, `~/.config/jetpack`) without `sudo`, `root`, or UAC elevation.
- **OS-Level Kernel Sandboxes**: Every worker runs in a default-deny OS sandbox (**Apple Seatbelt** on macOS, **AppContainer + Job Objects** on Windows, **Bubblewrap + Landlock LSM** on Linux) with no direct network access and user-approved folder access only.
- **End-to-End Encrypted Local Bridge**: Browser web apps authenticate via an explicit native OS approval dialog (`jetpack://pair`) and communicate over loopback `127.0.0.1` using `X25519` + `Ed25519` key exchange and `ChaCha20-Poly1305` encrypted binary frames.

---

## Download & Verify Releases

Download the latest release archive for your platform and `SHA256SUMS.txt` from the **Releases** page of this repository:

| Platform | Architecture | Release Artifact |
| :--- | :--- | :--- |
| **macOS** | Apple Silicon (`darwin/arm64`) | `JetPack-macos-arm64.dmg` or `JetPack-macos-arm64.app.zip` |
| **Windows** | 64-bit (`windows/amd64`) | `JetPack-windows-x64.zip` |
| **Linux** | 64-bit (`linux/amd64`) | `JetPack-linux-x64.tar.gz` |

### Verify Checksums (`SHA256SUMS.txt`)

Before extracting or running any downloaded file, verify its SHA-256 checksum against `SHA256SUMS.txt`:

- **macOS**:
  ```bash
  shasum -a 256 -c SHA256SUMS.txt --ignore-missing
  ```
- **Linux**:
  ```bash
  sha256sum -c SHA256SUMS.txt --ignore-missing
  ```
- **Windows (PowerShell)**:
  ```powershell
  Get-FileHash .\JetPack-windows-x64.zip -Algorithm SHA256
  Get-Content .\SHA256SUMS.txt
  ```

---

## Installation & Quick Start

Each release package includes the `JetPack` background tray agent with the embedded **Control Center** UI and a lightweight starter app (`examples/ffmpeg-media-converter`). Additional apps can be pulled on demand from the signed App Store inside Control Center.

### macOS (`darwin/arm64`)
1. Open `JetPack-macos-arm64.dmg` (or unzip `JetPack-macos-arm64.app.zip`) and drag `JetPack.app` into `/Applications` or `~/Applications`.
2. Double-click `JetPack.app` to start the menu-bar tray agent (runs silently in the menu bar without a Dock icon).
   - *First-launch Gatekeeper note (unsigned preview builds)*: Right-click `JetPack.app` → **Open**, or run:
     ```bash
     xattr -dr com.apple.quarantine /Applications/JetPack.app
     ```
3. Click the JetPack menu-bar icon → **Open Control Center** (or visit `http://127.0.0.1:9470`).

### Windows (`windows/amd64`)
1. Extract `JetPack-windows-x64.zip` into a user folder such as `%LOCALAPPDATA%\JetPack\`.
2. Double-click `jetpack-daemon.exe` — it starts silently in the Windows system tray without opening a console window.
3. Right-click the JetPack tray icon → **Open Control Center** (or visit `http://127.0.0.1:9470`).

### Linux (`linux/amd64`)
1. Ensure GTK 3 and AppIndicator runtime libraries (`libgtk-3-0` and `libayatana-appindicator3-1` or `libappindicator3-1`) plus `bubblewrap` (`bwrap`) are installed on your distribution.
2. Extract `JetPack-linux-x64.tar.gz` into a user directory:
   ```bash
   mkdir -p ~/.local/opt/jetpack
   tar -xzf JetPack-linux-x64.tar.gz -C ~/.local/opt/jetpack
   ```
3. Launch the tray agent:
   ```bash
   ~/.local/opt/jetpack/jetpack-daemon
   ```
4. Open **Control Center** from the tray menu or navigate to `http://127.0.0.1:9470`.

### Tray Controls
- **Open Control Center** / **Open App Store**: Manage installed apps, GPU hardware telemetry, and running workers.
- **Launch at Login**: Toggle unprivileged user-space autostart at login.
- **Open Logs** / **Export Diagnostics...**: Inspect `daemon.log` or export a sanitized `.zip` diagnostic bundle.

---

## Documentation

Full platform, security, and SDK documentation is included in the [`docs/`](./docs/index.md) directory (with a prebuilt static VitePress site under `docs/.vitepress/dist/`):

- [Documentation Home](./docs/index.md)
- [Introduction & Philosophy](./docs/guide/introduction.md)
- [Architecture & User Space Layout](./docs/guide/architecture.md)
- [Security Overview & Threat Model](./docs/security/overview.md)
- [OS Kernel Sandboxing](./docs/security/os-sandboxing.md)
- [Frontend SDK Quickstart (@jetpack/client)](./docs/sdk/frontend/quickstart.md)
- [Python Worker SDK](./docs/sdk/worker/python-sdk.md)
- [App Manifest Reference (app.toml)](./docs/publishing/manifest-reference.md)
