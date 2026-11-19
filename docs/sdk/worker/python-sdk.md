# Python Worker SDK (`jetpack_sdk`) & GPU Wheels

JetPack provides a lightweight, zero-dependency-capable Python SDK (`sdks/python/jetpack_sdk`) for building sandboxed AI, tensor, and media workers, paired with a hermetic `uv` + `python-build-standalone` provisioner inside `jetpack-daemon`.

## 1. Connecting via `JetPackClient`

When `jetpack-daemon` launches your worker inside its OS sandbox, it sets `JETPACK_IPC_ENDPOINT` to the job's Unix Domain Socket (`ipc.sock`) or Windows Named Pipe (`\\.\pipe\jetpack-worker-<job_id>`).

```python
from jetpack_sdk import FrameHeader, HybridFrame, JetPackClient

with JetPackClient() as client:
    while True:
        frame = client.read_frame()
        if frame is None:
            break  # Daemon closed IPC channel; exit cleanly

        header = frame.header
        if header.opcode == "compute.echo":
            # Reply preserving channel_id and correlation_id
            client.send_frame(
                opcode="compute.echo.ok",
                payload=frame.payload,
                channel_id=header.channel_id,
                correlation_id=header.correlation_id,
            )
```

### `JetPackClient` API (`sdks/python/jetpack_sdk/client.py`)

- `JetPackClient(endpoint: Optional[str] = None)`: Connects to `endpoint` or reads `JETPACK_IPC_ENDPOINT`. Supports context manager (`with JetPackClient() as client:`).
- `read_frame(timeout: Optional[float] = None) -> Optional[HybridFrame]`: Reads the next `[4B frame_len] + [4B header_len] + [MsgPack Header] + [Raw Payload]` frame; returns `None` on EOF.
- `send(frame: HybridFrame) -> None`: Serializes and writes a `HybridFrame`.
- `send_frame(opcode, payload=b"", channel_id=0, correlation_id=None, target_worker=None) -> None`: Convenience wrapper constructing `FrameHeader` + `HybridFrame`.
- `proxy_endpoint -> Optional[str]`: Property returning `JETPACK_PROXY_ENDPOINT` / `HTTP_PROXY` / `ALL_PROXY` when outbound network rules are granted.

## 2. Zero-Copy `memoryview` Buffer Processing

Avoid intermediate `bytes` copies or JSON encoding when processing tensors, audio chunks, or image frames. Wrap `frame.payload` in Python's `memoryview` (inspired by `examples/gpu-tensor-worker/worker.py`):

```python
import array
import struct
from jetpack_sdk import JetPackClient


def handle_tensor_op(client: JetPackClient, frame) -> None:
    # Zero-copy view over the binary payload bytes
    mv = memoryview(frame.payload)

    # Example binary layout: [uint32 count][float32 * count]
    (count,) = struct.unpack_from("<I", mv, 0)
    floats_view = mv[4 : 4 + count * 4].cast("f")

    # Process in-place into an array/tensor buffer without string conversion
    scaled = array.array("f", (x * 2.0 for x in floats_view))
    out_bytes = memoryview(scaled).tobytes()

    client.send_frame(
        opcode="compute.tensor_result",
        payload=out_bytes,
        channel_id=frame.header.channel_id,
        correlation_id=frame.header.correlation_id,
    )
```

For NumPy or PyTorch workflows, `torch.frombuffer(memoryview(frame.payload), dtype=torch.float32)` maps directly onto the incoming frame buffer with zero copying on CPU before transferring to CUDA or MPS.

## 3. Hermetic `uv` Provisioning & Automatic GPU Wheel Selection

When an `app.toml` declares `[python_env]`, `jetpack-daemon` (`crates/jetpack-daemon/src/python.rs`) provisions `<app_dir>/.venv` **without ever touching host Python** (`/usr/bin/python3`, Homebrew, Conda, or Windows Registry Python):

- `env_clear()` strips inherited `PYTHONPATH`, `PYTHONHOME`, `VIRTUAL_ENV`, and `CONDA_PREFIX`.
- `UV_NO_CONFIG=1` and `UV_PYTHON_PREFERENCE=only-managed` restrict `uv` strictly to `<root>/runtimes/uv/` and `<root>/runtimes/python/` (`python-build-standalone`).
- `UV_CACHE_DIR=<root>/cache/uv` (mode `0700`) shares downloaded wheels across all apps using `UV_LINK_MODE=clone` (macOS APFS) or `UV_LINK_MODE=hardlink` (Linux/Windows).
- If `[python_env].uv_lock_sha256` is specified, `<app_dir>/uv.lock` is SHA-256 verified before invoking `uv --locked`.
- Upon completion, `<app_dir>/.venv/.jetpack-provisioned.json` is written so subsequent launches skip redundant provisioning (**Fast Replay**).

### Hardware-Aware Backend Resolution (`PythonComputeBackend`)

Combining `HardwareProfile` (`004-hardware-discovery`), `[hardware].accelerators`, and `[permissions].gpu_access`, the daemon automatically selects the optimal wheel index:

| Host Hardware & Manifest | Selected Backend | Default PyTorch Wheel Index (or `[python_env.backend_indexes]`) |
| :--- | :--- | :--- |
| NVIDIA GPU (`NVML`) + `"cuda"` + `gpu_access = true` | `cuda` | `https://download.pytorch.org/whl/cu124` |
| Apple Silicon (`Metal`) + `"metal"` / `"mps"` / `"mlx"` + `gpu_access = true` | `mps` | Standard PyPI native `darwin/arm64` wheels |
| AMD GPU + `"rocm"` + `gpu_access = true` | `rocm` | `https://download.pytorch.org/whl/rocm6.2` |
| No matching GPU or `gpu_access = false` | `cpu` | `https://download.pytorch.org/whl/cpu` |

You can override any backend index per app in `app.toml`:

```toml
[python_env]
python_version = "3.12"
requirements = ["jetpack-sdk", "torch>=2.4.0"]
uv_lock_sha256 = "428843fd0e0da23463920ba9aa0191a39f32a47b02e97a936c974ba996b4b98f"
isolated = true

[python_env.backend_indexes]
cuda = "https://download.pytorch.org/whl/cu124"
rocm = "https://download.pytorch.org/whl/rocm6.2"
cpu = "https://download.pytorch.org/whl/cpu"
```
