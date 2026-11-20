---
layout: home

hero:
  name: "JetPack"
  text: "Native GPU Compute for Web Apps. Zero VMs."
  tagline: "A lightweight Rust tray orchestrator (~5–10 MB) bridging WebAssembly frontends to OS-sandboxed native & Python workers over encrypted zero-copy binary WebSockets."
  image:
    src: /logo.webp
    alt: JetPack Logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Architecture
      link: /guide/architecture
    - theme: alt
      text: Security Audit
      link: /security/overview
    - theme: alt
      text: Frontend SDK
      link: /sdk/frontend/quickstart

features:
  - icon: ⚡
    title: Native GPU Speed Without VMs
    details: Executes native host binaries (PE/.exe, Mach-O, ELF) and standalone Python via uv with direct hardware access to CUDA, Apple Metal / MPS / MLX, ROCm, Vulkan, and DirectML—never WSL2, Hyper-V, or Docker Desktop.
  - icon: 🛡️
    title: OS-Level Kernel Sandbox
    details: Default-deny process isolation enforced by Windows AppContainer + Job Objects, macOS Seatbelt (deny default), and Linux unprivileged Bubblewrap namespaces + Landlock LSM. Workers have zero direct host network stack.
  - icon: 🧹
    title: Zero System Pollution
    details: Installs and runs strictly in user space without admin/root privileges, global PATH mutations, Windows HKLM registry writes, or host Python interpreter coupling. Content-addressable deduplication uses hardlinks and APFS CoW clones.
  - icon: 🔐
    title: Binary Zero-Copy IPC
    details: Out-of-Band jetpack://pair approval, X25519 + Ed25519 handshake, and ChaCha20-Poly1305 encrypted hybrid framing ([4B len] + [MsgPack Header] + [Raw Payload]) deliver zero-copy buffers from WASM to workers.
---

## Quick Navigation

| Audience | Start Here | What You Will Learn |
| :--- | :--- | :--- |
| **Platform Users & Explorers** | [Introduction & Philosophy](/guide/introduction) | Why browser WebGPU/WASM hits hardware walls and how JetPack solves local compute |
| **Security Auditors** | [Security Overview](/security/overview) | Out-of-Band pairing, `X25519` + `ChaCha20-Poly1305`, OS sandboxes, and `Ed25519` signed catalogs |
| **Web / Frontend Developers** | [@jetpack/client Quickstart](/sdk/frontend/quickstart) | Connect browser apps via `connectAndEnsureApp`, `request`, and `onStream` |
| **AI / Media Worker Authors** | [Python Worker SDK](/sdk/worker/python-sdk) | Zero-copy `memoryview` IPC, automatic GPU wheel selection, and portable native runtimes |
| **App Publishers & Operators** | [Manifest Reference](/publishing/manifest-reference) | Strict `app.toml` schema, `--package-app` OCI bundles, and `--sign-catalog` workflows |
