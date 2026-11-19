# Binary Framing Protocol

JetPack prohibits JSON over WebSockets for control-plane and worker data payloads. Every message uses **Hybrid Binary Framing** (`crates/jetpack-proto/src/framing.rs`) so structured metadata stays compact via MessagePack while large buffers (tensors, audio PCM, video frames, JPEG previews) remain raw zero-copy bytes.

## 1. Plaintext Hybrid Frame Layout

```text
+-------------------------------+------------------------+------------------------+
| header_len: uint32 LE (4 B)   | MsgPack Header (N B)   | Raw Binary Payload (M) |
+-------------------------------+------------------------+------------------------+
|<--------- 4 bytes ----------->|<------ N bytes ------->|<------ M bytes ------->|
```

- **Size Limits**:
  - `MAX_HEADER_SIZE`: `64 KiB` (`65,536` bytes)
  - `MAX_FRAME_SIZE`: `64 MiB` (`67,108,864` bytes)
- **Zero-Copy Slicing**: On decode, `jetpack-proto` validates `plaintext.len() >= 4 + N`, deserializes the MsgPack header from `&plaintext[4 .. 4 + N]`, and returns `Bytes::slice(4 + N ..)` as the payload without allocating or copying the `M`-byte binary body.

### `FrameHeader` Schema (MsgPack Map)

Serialized with named MsgPack fields (`rmp_serde::to_vec_named`):

```rust
pub struct FrameHeader {
    pub channel_id: u32,
    pub opcode: String,
    pub correlation_id: Option<u64>,
    pub target_worker: Option<String>,
}
```

| Field | Type | Purpose |
| :--- | :--- | :--- |
| `channel_id` | `u32` | Logical multiplexing stream/channel (`0` for control plane, `1+` for worker channels). |
| `opcode` | `string` | Operation identifier (e.g. `"hardware.get_profile"`, `"app.launch"`, `"compute.tensor_op"`). |
| `correlation_id` | `u64?` | Optional request/response correlation ID matched by `JetPackAppClient.request()`. |
| `target_worker` | `string?` | `None` routes to the daemon control plane; `Some(app_id)` or `Some("primary")` routes to the primary worker; `Some(service_name)` routes to a `[services.<name>]` companion. |

## 2. Encrypted WebSocket Wire Envelope

Over `ws://127.0.0.1:9470`, each plaintext `HybridFrame` is authenticated and encrypted using `ChaCha20-Poly1305`:

```text
+-------------------------------+----------------------------------------+------------------------+
| seq: uint64 LE (8 B, AAD)     | Ciphertext of Plaintext Frame (4+N+M)  | Poly1305 Tag (16 B)    |
+-------------------------------+----------------------------------------+------------------------+
```

- **Nonce Construction (`12 B`)**:
  - Client -> Daemon: `b"C2D\0" || seq.to_le_bytes()`
  - Daemon -> Client: `b"D2C\0" || seq.to_le_bytes()`
- **Replay Protection**: Both sides start `seq` at `0` and require `incoming_seq == expected_seq` strictly incrementing by `+1`.
- **Text Frame Rejection**: Any `Message::Text` frame received after handshake completion triggers immediate connection termination with WebSocket close code `1003 Unsupported Data`.

## 3. Local Kernel Worker IPC Framing

Between `jetpack-daemon` and sandboxed workers (`UDS` on macOS/Linux, `Named Pipe` on Windows), traffic crosses an OS-isolated local boundary and is **not** re-encrypted. Instead, stream boundaries are delimited by an outer 4-byte frame length (`sdks/python/jetpack_sdk/framing.py`):

```text
+-------------------------------+-------------------------------+------------------------+------------------------+
| frame_len: uint32 LE (4 B)    | header_len: uint32 LE (4 B)   | MsgPack Header (N B)   | Raw Binary Payload (M) |
+-------------------------------+-------------------------------+------------------------+------------------------+
```

Where `frame_len = 4 + N + M`. This allows Python workers (`memoryview`) and Rust IPC readers (`bytes::Bytes`) to read each frame in two contiguous reads without scanning or base64 decoding.

## 4. Control-Plane Opcodes Summary

| Request Opcode | Response / Stream Opcodes | Payload Direction |
| :--- | :--- | :--- |
| `hardware.get_profile` | `hardware.profile` | Empty -> `HardwareProfile` (MsgPack) |
| `catalog.get` | `catalog.ok` | Empty -> `CatalogAppEntry[]` (MsgPack) |
| `app.list` | `app.list.ok` | Empty -> `AppInfo[]` (MsgPack) |
| `app.pull` | `app.pull.progress`, `app.pull.ok`, `app.error` | `AppPullRequest` -> Progress / OK |
| `app.launch` | `app.launch.ok`, `app.error` | `AppLaunchRequest` -> `job_id` |
| `app.volumes.reset` | `app.volumes.reset.ok`, `app.error` | `AppVolumesResetRequest` -> `reset_count` |
| `app.terminate` | `app.terminate.ok`, `app.error` | `AppTerminateRequest` -> OK |
| `client.list` / `client.revoke` | `client.list.ok` / `client.revoke.ok` | Client management |
| `settings.get` / `settings.set` | `settings.get.ok` / `settings.ok` | `DaemonSettings` |
| `system.echo` | `system.echo` | Diagnostic raw echo |
