# Frontend API Reference

This page documents both the high-level TypeScript SDK (`@jetpack/client`) and the underlying `wasm-bindgen` bindings (`jetpack-wasm`).

## High-Level SDK: `JetPackAppClient` (`@jetpack/client`)

Source: `web/packages/jetpack-client/src/client.ts` and `types.ts`.

### Methods

| Method | Signature | Description |
| :--- | :--- | :--- |
| `connectAndEnsureApp` | `(options: ConnectAndEnsureAppOptions) => Promise<this>` | Initializes WASM, connects & pairs if needed, pulls from `SignedAppCatalog` if absent, and launches the target worker. |
| `request` | `(opcode: string, meta?: Record<string, unknown> \| null, binaryPayload?: Uint8Array, options?: RequestOptions) => Promise<WorkerResponse>` | Sends a correlated `HybridFrame` (`target_worker = appId`) and resolves with `{ opcode, payload, correlationId }`. |
| `onStream` | `(opcode: string, callback: StreamCallback) => () => void` | Subscribes to unsolicited or streaming worker frames matching `opcode` (or `'*'`). Returns an idempotent unsubscribe function. |
| `isConnected` | `() => boolean` | Returns `true` when an authenticated session is active and bound to an ensured `appId`. |
| `getAppId` | `() => string \| null` | Returns the currently ensured `appId`, or `null` if disconnected. |
| `getIdentity` | `() => WasmIdentityLike \| null` | Returns the active `WasmClientIdentity`, if initialized. |
| `getLastPairingUri` | `() => string \| null` | Returns the last generated `jetpack://pair?...` URI if auto-pairing ran. |
| `getRawClient` | `() => WasmClientLike \| null` | Exposes the underlying `JetPackWasmClient` for control-plane calls (`get_hardware_profile`, `reset_app_volumes`, etc.). |
| `close` | `() => void` | Closes the WebSocket, clears stream listeners, and rejects pending `request()` calls with `CLIENT_CLOSED`. |

### `ConnectAndEnsureAppOptions`

```typescript
export interface ConnectAndEnsureAppOptions {
  appId: string;
  daemonPort?: number;              // Default: 9470
  wsUrl?: string;                   // Overrides ws://127.0.0.1:<daemonPort>
  origin?: string;                  // Overrides window.location.origin
  ociReference?: string;            // Explicit OCI ref (for local/custom testing)
  autoPair?: boolean;               // Default: true
  resetVolumes?: boolean;           // Default: false
  pairingPollIntervalMs?: number;   // Default: 1500
  pairingTimeoutMs?: number;        // Default: 60000
  disableAutoDeepLink?: boolean;    // Default: false
  onProgress?: (progress: AppPullProgress) => void;
  onPairingUri?: (uri: string) => void;
  wasmModule?: WasmBindingsAdapter;
  wasmModulePath?: string;
  wasmBinaryOrUrl?: unknown;
}
```

### `WorkerResponse` & `StreamCallback`

```typescript
export interface WorkerResponse {
  opcode: string;
  payload: Uint8Array;
  correlationId: number;
}

export interface StreamFrameContext {
  opcode: string;
  correlationId: number | null;
}

export type StreamCallback = (payload: Uint8Array, context: StreamFrameContext) => void;
```

### `JetPackClientError` Codes

| Code | Cause |
| :--- | :--- |
| `NOT_CONNECTED` | `request()` called before `connectAndEnsureApp()` succeeded. |
| `CLIENT_CLOSED` | `request()` called after `close()`, or `close()` invoked while a request was in flight. |
| `PAIRING_TIMEOUT` | User did not approve `jetpack://pair` within `pairingTimeoutMs`. |
| `APP_NOT_IN_CATALOG` | `appId` is neither installed locally nor present in `SignedAppCatalog` (and `ociReference` was omitted). |
| `REQUEST_TIMEOUT` | Worker did not reply within `RequestOptions.timeoutMs`. |
| `WASM_LOAD_FAILED` | Failed to dynamically import `jetpack-wasm` bindings. |
| `INVALID_OPTIONS` | Missing or empty `appId` passed to `connectAndEnsureApp()`. |

---

## Low-Level WASM Bindings (`jetpack-wasm`)

Source: `crates/jetpack-wasm/src/identity.rs` and `client.rs`.

### `WasmClientIdentity`

- `new WasmClientIdentity()` (`load_or_generate`): Loads or generates `client_id` (`UUIDv4`) + `Ed25519` / `X25519` 32-byte seeds in `localStorage` (`jetpack_client_id`, `jetpack_ed25519_seed`, `jetpack_x25519_seed`), falling back to ephemeral in-memory keys if storage is blocked.
- `WasmClientIdentity.generate_new_ephemeral()`: Creates a fresh in-memory identity without touching `localStorage`.
- `WasmClientIdentity.clear_storage()`: Removes persisted identity keys from `localStorage`.
- `identity.client_id`: Getter returning the `UUIDv4` string.
- `identity.public_key_bundle_base64()`: Returns the URL-safe Base64 64-byte (`Ed25519` + `X25519`) public key bundle.
- `identity.ed25519_pubkey_hex()` / `identity.x25519_pubkey_hex()`: Returns 32-byte hex public keys.
- `identity.generate_pairing_uri(origin)`: Validates and normalizes `origin` and returns `jetpack://pair?client_id=...&pubkey=...&origin=...`.

### `JetPackWasmClient`

| Method | Return Type | Description |
| :--- | :--- | :--- |
| `JetPackWasmClient.connect(wsUrl, identity, origin?)` | `Promise<JetPackWasmClient>` | Opens binary WebSocket (`arraybuffer`) and executes `ClientHello` / `ServerHello` handshake. |
| `is_connected()` | `boolean` | Returns `true` when in `Established` encrypted session state. |
| `get_hardware_profile()` | `Promise<HardwareProfile>` | Sends `hardware.get_profile` and resolves with CPU, RAM/unified memory, and GPU device details. |
| `get_catalog()` | `Promise<CatalogAppEntry[]>` | Fetches verified entries from the active `SignedAppCatalog` (refreshed via `catalog_url` with cached/embedded fallback), including `coming_soon?: boolean`. |
| `list_apps()` | `Promise<AppInfo[]>` | Lists installed apps with `status`, `is_verified`, and sanitized `volumes` (`folder_name`, `is_configured`—never host paths). |
| `pull_app(imageRef, onProgress?, appId?)` | `Promise<AppPullOkResponse>` | Pulls a catalog-verified OCI app and streams `app.pull.progress` events. |
| `launch_app(appId, resetVolumes?)` | `Promise<AppLaunchOkResponse>` | Starts sandboxed worker (`reset_volumes` forces fresh `rfd` folder prompts). |
| `reset_app_volumes(appId, volumeName?)` | `Promise<AppVolumesResetOkResponse>` | Clears persisted `authorized_volumes` entries in `paired_clients.db`. |
| `terminate_app(appIdOrJobId)` | `Promise<AppTerminateOkResponse>` | Terminates a running job and its OS sandbox. |
| `list_paired_clients()` | `Promise<PairedClientSummary[]>` | Lists paired browser clients from `paired_clients.db`. |
| `revoke_client(clientId?, origin?)` | `Promise<ClientRevokeOkResponse>` | Revokes paired client access. |
| `get_settings()` / `set_developer_mode(enabled)` | `Promise<DaemonSettings>` | Reads or updates daemon UI settings. |
| `export_diagnostics()` | `Promise<DiagnosticsExportResult>` | Requests `diagnostics.export` and returns `{ filename, generated_at_unix, log_tail_bytes, log_truncated, redactions_applied, zip_bytes }` where `zip_bytes` is a `Uint8Array` sliced from the binary frame. |
| `send_diagnostics()` | `Promise<DiagnosticsSendOkResponse>` | Requests `diagnostics.send` to transmit a sanitized diagnostic JSON report to `[diagnostics].report_url` (rejects with `[DIAGNOSTICS_DISABLED]` when `report_url` is unset). |
| `send_worker_frame(targetWorker, opcode, metaJs, rawPayload)` | `void` | Fire-and-forget encrypted `HybridFrame` dispatch to a worker. |
| `request_worker_frame(targetWorker, opcode, metaJs, rawPayload)` | `Promise<WorkerResponse>` | Correlated worker request matching `correlation_id`. |
| `on_worker_frame(callback)` | `void` | Registers `(opcode, payloadUint8Array, correlationId)` listener for unsolicited/stream frames. |
| `close()` | `void` | Closes WebSocket and fails pending promises. |
