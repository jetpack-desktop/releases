# Frontend Quickstart (`@jetpack/client`)

The `@jetpack/client` TypeScript package (`web/packages/jetpack-client`) provides `JetPackAppClient`, a high-level wrapper over `jetpack-wasm` that automates cryptographic identity management, Out-of-Band `jetpack://pair` onboarding, catalog pulls, worker launch, correlated binary requests, and streaming event subscriptions.

## 1. Connect, Pair, Pull, and Launch in One Call

```typescript
import { JetPackAppClient, JetPackClientError } from '@jetpack/client';

const client = new JetPackAppClient();

try {
  await client.connectAndEnsureApp({
    appId: 'io.jetpack.media-converter',
    daemonPort: 9470,
    onPairingUri: (uri) => {
      // Optional: display an interactive "Approve Pairing in JetPack" button or link
      console.log('Approve pairing URI:', uri);
    },
    onProgress: (progress) => {
      console.log(
        `[${progress.stage ?? 'pull'}] ${progress.percent ?? 0}% - ${progress.message ?? ''}`
      );
    },
  });

  console.log('Worker ready:', client.getAppId());
} catch (err) {
  if (err instanceof JetPackClientError) {
    console.error(`JetPack error [${err.code}]: ${err.message}`);
  } else {
    throw err;
  }
}
```

### What `connectAndEnsureApp()` Automates

1. **WASM Initialization & Identity**: Loads `jetpack-wasm` and restores (or creates) `WasmClientIdentity` (`Ed25519` + `X25519` keys persisted in `localStorage`).
2. **Authenticated WebSocket Session**: Connects to `ws://127.0.0.1:9470` and executes the `ClientHello` / `ServerHello` handshake.
3. **Auto-Pairing (`autoPair: true`)**: If the browser origin is unpaired, generates `jetpack://pair?client_id=...&pubkey=...&origin=...`, invokes `onPairingUri(uri)`, triggers the deep link (unless `disableAutoDeepLink: true`), and polls until approved or `pairingTimeoutMs` (`60000ms` default) elapses.
4. **Install & Provision Check**: Queries `list_apps()`. If `appId` is missing, resolves `ociReference` from options or `get_catalog()` (verified `SignedAppCatalog`) and runs `pull_app()`, forwarding `oci_layer` and `uv_sync` progress to `onProgress`.
5. **Worker Boot**: Calls `launch_app(appId, resetVolumes)` if the worker is not already `Running`.

## 2. Send Correlated Zero-Copy Binary Requests (`request`)

Send structured metadata (encoded as MsgPack by `jetpack-wasm`) alongside a zero-copy `Uint8Array` payload directly to your ensured worker:

```typescript
const fileBytes = new Uint8Array(await selectedFile.arrayBuffer());

const response = await client.request(
  'media.inspect',
  { filename: selectedFile.name, include_streams: true },
  fileBytes,
  { timeoutMs: 30_000 }
);

console.log('Reply opcode:', response.opcode);
console.log('Correlation ID:', response.correlationId);
const jsonSummary = JSON.parse(new TextDecoder().decode(response.payload));
console.log('Probe result:', jsonSummary);
```

Under the hood, `request()` assigns a monotonic `correlation_id`, encrypts the `HybridFrame` with `ChaCha20-Poly1305`, and resolves once the worker replies with the matching `correlation_id` (or rejects on `app.error` / `system.error` / `REQUEST_TIMEOUT`).

## 3. Subscribe to Streaming Events (`onStream`) & Clean Up (`close`)

Subscribe to real-time progress frames, telemetry, or unsolicited worker streams by exact opcode or wildcard `'*'`:

```typescript
const unsubscribeProgress = client.onStream('media.transcode.progress', (payload, ctx) => {
  const text = new TextDecoder().decode(payload);
  console.log(`Progress (corr=${ctx.correlationId}):`, text);
});

const unsubscribeAll = client.onStream('*', (payload, ctx) => {
  console.debug(`[stream:${ctx.opcode}] ${payload.byteLength} bytes`);
});

// Trigger a long-running transcode request
const result = await client.request(
  'media.transcode',
  { preset: 'hevc_videotoolbox', crf: 24 },
  new Uint8Array(0)
);

// Clean up when unmounting your UI component
unsubscribeProgress();
unsubscribeAll();
client.close();
```

`client.close()` shuts down the WebSocket, clears all `onStream` handlers, and rejects any pending `request()` promises with `JetPackClientError('CLIENT_CLOSED', ...)`.

## Next Steps

- Inspect all TypeScript interfaces and low-level `jetpack-wasm` bindings in the [Frontend API Reference](/sdk/frontend/api-reference).
- Review the exact wire layout in the [Binary Framing Protocol](/sdk/frontend/binary-framing).
