<p align="left">
  <img src="./public/logo.webp" alt="JetPack Logo" width="56" height="56" />
</p>

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

Each release package includes the `JetPack` background tray agent (`jetpack-daemon`) with the embedded **Control Center** UI, the `jetpack` developer CLI & local MCP server (`jetpack mcp`), and a lightweight starter app (`examples/ffmpeg-media-converter`). Additional apps can be pulled on demand from the signed App Store inside Control Center.

### macOS (`darwin/arm64`)
1. Open `JetPack-macos-arm64.dmg` (or unzip `JetPack-macos-arm64.app.zip`) and drag `JetPack.app` into `/Applications` or `~/Applications`.
2. Double-click `JetPack.app` to start the menu-bar tray agent (runs silently in the menu bar without a Dock icon).
   - *First-launch Gatekeeper note (unsigned preview builds)*: Right-click `JetPack.app` → **Open**, or run:
     ```bash
     xattr -dr com.apple.quarantine /Applications/JetPack.app
     ```
3. Click the JetPack menu-bar icon → **Open Control Center** (or visit `http://127.0.0.1:9470`).
4. The `jetpack` CLI & MCP server binary is bundled at `/Applications/JetPack.app/Contents/MacOS/jetpack`.

### Windows (`windows/amd64`)
1. Extract `JetPack-windows-x64.zip` into a user folder such as `%LOCALAPPDATA%\JetPack\`.
2. Double-click `jetpack-daemon.exe` — it starts silently in the Windows system tray without opening a console window.
3. Right-click the JetPack tray icon → **Open Control Center** (or visit `http://127.0.0.1:9470`).
4. The `jetpack.exe` CLI & MCP server binary sits in the same folder (`%LOCALAPPDATA%\JetPack\jetpack.exe`).

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
5. The `jetpack` CLI & MCP server binary is extracted alongside it at `~/.local/opt/jetpack/jetpack`.

### Tray Controls & Custom Icon Override
- **Tray Visual States**: Monochrome white template silhouette when `Idle` (automatically adapting light/dark contrast via macOS template mode), smooth `100ms` sinusoidal color pulse (`#EA580C` ↔ `#FBBF24` over a static silhouette) when workers or OCI pulls are `Active`, and solid crimson (`#EF4444`) on `Error`.
- **Custom Tray Icon Override**: Place a transparent RGBA or Grayscale+Alpha PNG (`<= 256x256` px, `<= 256 KiB`) at `<JETPACK_HOME>/config/tray-icon.png` and restart the daemon to use a custom monochrome silhouette with full dynamic state tinting. Invalid or oversized files fall back safely to the embedded template.
- **Open Control Center** / **Open App Store**: Opens automatically on manual startup (`open_dashboard_on_startup = true`, configurable under **My Hardware & Security**) and remains accessible anytime from the tray menu to manage installed apps, live provisioning progress, GPU telemetry, and running workers.
- **Check for Updates...** / **Update Available**: Check `jetpack-desktop/releases` for newer builds, verify `SHA256SUMS.txt` checksums, and safely restart into the updated version (also accessible inside Control Center → **My Hardware & Security** → **JetPack Updates**).
- **Launch at Login**: Toggle unprivileged user-space autostart at login (passes `--background` silently so OS boot does not pop up the Control Center window).
- **Open Logs** / **Export Diagnostics...**: Inspect `daemon.log` or export a sanitized `.zip` diagnostic bundle.

### Canonical Brand & Icon Asset Paths
- **Native Daemon & Desktop Bundles (`crates/jetpack-daemon/assets/icons/`)**: `tray-icon.png` (`64x64` monochrome tray template), `app-icon.png` (`1024x1024` macOS `.icns` master), `app-icon-256.png` (`256x256` Linux user-space `$XDG_DATA_HOME/icons/hicolor/256x256/apps/jetpack-daemon.png`), and `app-icon.ico` (multi-size Windows executable icon).
- **Web Control Center (`web/public/`)**: `logo.webp` (`256x256`), `logo-192.png` (`192x192`), `apple-touch-icon.png` (`180x180`), and `favicon.ico` (`16`/`32`/`48` px), automatically embedded into `jetpack-daemon` via `web/dist/`.
- **Documentation Portal (`docs/public/`)**: `logo.webp` (`256x256`), `logo.png` (`256x256`), and `favicon.ico` (`16`/`32`/`48` px).

---

## Building with AI Agents

JetPack ships first-class AI-Agent DX tooling across Claude Code, Cursor, Windsurf, and OpenClaw:

- **LLM-Ready Docs (`llms.txt` & `llms-full.txt`)**: Point Cursor `@Docs` or your coding agent to `https://jetpack-desktop.github.io/llms-full.txt` (or the index at `https://jetpack-desktop.github.io/llms.txt`).
- **AI Project Scaffolding (`jetpack init`)**: Run `jetpack init ./my-app --template fullstack` (or `jetpack-daemon --init-app ./my-app`) to generate `AGENTS.md`, regular-file `CLAUDE.md`, `.cursor/rules/jetpack.mdc`, and `.agents/skills/{create-jetpack-worker,add-binary-opcode,debug-pairing}/SKILL.md`.
- **Built-In Local MCP Server (`jetpack mcp`)**: Connect the bundled `jetpack` binary over `stdio` to expose `search_docs`, `get_daemon_status`, `read_worker_logs`, `validate_manifest`, and `scaffold_app`:
  - **macOS**: `"command": "/Applications/JetPack.app/Contents/MacOS/jetpack", "args": ["mcp"]`
  - **Windows**: `"command": "C:\\Users\\<you>\\AppData\\Local\\JetPack\\jetpack.exe", "args": ["mcp"]`
  - **Linux**: `"command": "/home/<you>/.local/opt/jetpack/jetpack", "args": ["mcp"]`
- **Typed Worker Contracts (`jetpack codegen`)**: Run `jetpack codegen --worker worker.py --out src/jetpack-env.d.ts` and instantiate `new JetPackAppClient<JetPackOpcodeMap>()` for compile-time verification of opcodes, metadata shapes, and binary `Uint8Array` payloads.

---

## Documentation

Full platform, security, and SDK documentation is included in the [`docs/`](./docs/index.md) directory (with a prebuilt static VitePress site under `docs/.vitepress/dist/`):

- [Documentation Home](./docs/index.md)
- [Introduction & Philosophy](./docs/guide/introduction.md)
- [Architecture & User Space Layout](./docs/guide/architecture.md)
- [AI Agents & MCP Integration](./docs/guide/ai-agents.md)
- [Security Overview & Threat Model](./docs/security/overview.md)
- [OS Kernel Sandboxing](./docs/security/os-sandboxing.md)
- [Frontend SDK Quickstart (@jetpack/client)](./docs/sdk/frontend/quickstart.md)
- [Python Worker SDK](./docs/sdk/worker/python-sdk.md)
- [App Manifest Reference (app.toml)](./docs/publishing/manifest-reference.md)
- [CLI Tools Reference](./docs/publishing/cli-tools.md)
