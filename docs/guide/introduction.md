# Introduction & Philosophy

JetPack is a cross-platform **Local Compute & Native App Orchestrator** designed to give modern web applications direct, sandboxed access to local CPU, RAM, and GPU hardware without requiring users to install Docker Desktop, virtual machines, or unmanaged Python toolchains.

## Why Browser-Only WebGPU & WASM Hit a Wall

WebAssembly (WASM) and WebGPU made significant strides in bringing computation to the browser, yet serious local AI inference, media transcoding, and native data processing encounter fundamental browser platform constraints:

| Constraint | Browser WASM / WebGPU | JetPack Native Workers |
| :--- | :--- | :--- |
| **Memory Ceiling** | `wasm32` linear memory is capped at **4 GiB** (often ~2 GiB practical allocation per tab), making 7B–70B parameter models or large video buffers impractical. | Full host physical RAM and Unified Memory (`16 GiB–192+ GiB`), plus direct dedicated GPU VRAM. |
| **GPU Ecosystem** | Limited to WebGPU/WGSL shaders; no access to vendor-tuned kernels such as **NVIDIA CUDA / cuDNN / TensorRT**, **Apple Metal / MPS / MLX**, **AMD ROCm**, or **VideoToolbox / NVENC**. | Direct native access to CUDA, Metal/MPS/MLX, ROCm, Vulkan, DirectML, and hardware video encoders when `permissions.gpu_access = true`. |
| **CPU Threading & SIMD** | Constrained by `SharedArrayBuffer` COOP/COEP headers, 128-bit WASM SIMD, and browser worker pool overhead. | Native multi-core threads, AVX2/AVX-512, NEON/AMX, and native C/C++/Rust/Python libraries. |
| **Binary Ecosystem** | Cannot run existing native binaries (`ffmpeg`, `llama.cpp`, `postgres`, PyTorch C++ extensions) without brittle Emscripten ports. | Runs unmodified multi-arch native binaries (`PE/.exe`, `Mach-O`, `ELF`) and standalone Python via `uv`. |
| **Storage & Deduplication** | Duplicated Origin-Private File System (OPFS) blobs per origin; slow multi-GB downloads. | Shared Content-Addressable Storage (`blobs/sha256/`) with OS hardlinks and macOS APFS Copy-on-Write clones. |

## Core Architectural Invariants

Every component in JetPack adheres to seven strict architectural invariants:

1. **Zero Virtual Machines**: No WSL2, Hyper-V, Apple `Virtualization.framework`, Docker Daemon, or `containerd`. Workers execute directly on the host kernel as native processes.
2. **User-Space Only (No Admin / No Root)**: Everything installs and executes inside the current unprivileged user's profile (`%APPDATA%\JetPack`, `~/Library/Application Support/JetPack`, `~/.config/jetpack`). No UAC prompts and no `sudo`.
3. **Zero System Pollution**: JetPack never writes to Windows `HKLM`, modifies global system `PATH`, installs system root CAs, or calls `/usr/bin/python3`.
4. **Rust as the Sole Gatekeeper**: Browser tabs never connect directly to Python or C++ workers. Every external WebSocket connection terminates, authenticates, and decrypts inside `jetpack-daemon` (Rust).
5. **Default-Deny OS Kernel Sandboxing**: Every worker runs inside a platform-native sandbox (`AppContainer` + `Job Objects` on Windows, `Seatbelt` on macOS, `bwrap` + `Landlock LSM` on Linux) with zero filesystem or network access unless explicitly granted.
6. **Userspace Network Proxy**: Sandboxed workers have no direct network interface. Allowed outbound `host:port` endpoints are proxied through `jetpack-daemon` according to `permissions.network_allowlist`.
7. **Zero-Copy Binary Framing**: No JSON payloads over WebSockets. Control plane and worker traffic use `[4B length] + [MsgPack Header] + [Raw Binary Payload]` protected by `X25519` + `ChaCha20-Poly1305`.

## Next Steps

- Explore the [Three-Tier Architecture & User Space Layout](/guide/architecture).
- Follow [Getting Started](/guide/getting-started) to launch `jetpack-daemon` and the Control Center.
- Review the [Security Overview](/security/overview) for a full audit of JetPack's isolation boundaries.
