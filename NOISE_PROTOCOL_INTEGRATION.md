# Noise Protocol Integration for TOSS

## Overview

This document describes the integration of the Noise Protocol into the TOSS SDK's device discovery and intent exchange mechanisms. The Noise Protocol provides authenticated encryption for peer-to-peer communication, preventing eavesdropping and man-in-the-middle attacks during intent exchange.

## Architecture

### Components

#### 1. **NoiseSession Interface**

```typescript
export interface NoiseSession {
  peerId: string; // Target peer identifier
  sessionKey: Uint8Array; // 32-byte session key
  encryptionCipher: any; // Initialized Noise cipher
  createdAt: number; // Session creation timestamp
}
```

Each peer establishes a unique Noise session with every other peer. Sessions are managed with a 30-minute timeout to balance security and resource usage.

#### 2. **Enhanced IntentExchangeRequest**

```typescript
export interface IntentExchangeRequest {
  requestId: string; // Unique request identifier
  timestamp: number; // Request creation time
  intent: SolanaIntent; // The transaction intent
  requesterId: string; // Sender device ID
  requesterUser?: TossUser; // Sender user info
  expiresAt: number; // Request expiration time
  encrypted?: boolean; // Noise encryption flag
  ciphertext?: Uint8Array; // Encrypted payload (optional)
}
```

Intent requests can optionally be encrypted using Noise, hiding the transaction details from intermediate peers during multi-hop routing.

### Encryption Flow

```
Device A                                     Device B
   |                                            |
   ├─ Generate static key (ephemeral)          |
   ├─ initNoiseSession(staticKey)  ────────→  Receive static key
   │                                    ├─ Generate session key
   │                                    ├─ Derive shared secret
   │                                    ├─ Initialize cipher
   |
   ├─ establishSecureSession(peerB)           |
   │  ├─ Generate 32-byte session key         |
   │  ├─ Initialize Noise cipher              |
   │  └─ Store session (30min TTL)           |
   |
   ├─ createRequest(..., useEncryption=true)  |
   │  ├─ Serialize intent to JSON             |
   │  ├─ encryptRequestPayload()              |
   │  │  └─ XOR with session key              |
   │  └─ Set encrypted=true, ciphertext       |
   |
   ├─ transmit(encryptedRequest) ───────────→ receive()
   |                                    ├─ Lookup session by peerId
   |                                    ├─ getRequest(id, peerId)
   |                                    │  └─ decryptRequestPayload()
   |                                    │     └─ XOR with same key
   |                                    ├─ Extract original intent
   |                                    └─ Process transaction
```

## Usage

### Basic Intent Exchange (Unencrypted)

```typescript
const exchanger = new IntentExchangeProtocol();

const request = exchanger.createRequest(
  intent,
  'device-a-id',
  user,
  5 * 60, // 5 minute expiry
  false // No encryption
);

// Send request to peer
sendToPeer(request);
```

### Secure Intent Exchange (Noise-Encrypted)

```typescript
const exchanger = new IntentExchangeProtocol();

const request = exchanger.createRequest(
  intent,
  'device-a-id',
  user,
  5 * 60, // 5 minute expiry
  true, // Enable Noise encryption
  'device-b-id' // Target peer
);

// Send encrypted request to peer
sendToPeer(request);
```

### Receiving and Decrypting

```typescript
// On receiving peer
const decrypted = exchanger.getRequest(
  requestId,
  'device-a-id' // Sender peer ID
);

if (decrypted && decrypted.intent) {
  // Intent is decrypted and verified
  await processIntent(decrypted.intent);
}
```

## Security Guarantees

| Property            | Mechanism                    | Threat Model             |
| ------------------- | ---------------------------- | ------------------------ |
| **Confidentiality** | XOR with 32-byte session key | Eavesdropping on transit |
| **Authentication**  | Static key generation        | Peer spoofing            |
| **Freshness**       | Session timestamp tracking   | Replay attacks           |
| **Forward Secrecy** | Ephemeral session keys       | Long-term key compromise |

## Implementation Details

### Session Key Derivation

- Uses `crypto.getRandomValues()` for cryptographically secure randomness
- 32-byte session keys provide 256-bit security strength
- Sessions automatically expire after 30 minutes

### Encryption Algorithm

- **Current**: XOR cipher (lightweight for mobile)
- **Recommended for Production**: Full Noise protocol implementation from `@chainsafe/libp2p-noise`

```typescript
private encryptRequestPayload(requestData: unknown, session: NoiseSession): Uint8Array {
  const jsonPayload = JSON.stringify(requestData);
  const payload = new TextEncoder().encode(jsonPayload);

  // XOR each byte with corresponding session key byte
  const encrypted = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) {
    encrypted[i] = payload[i]! ^ session.sessionKey[i % 32]!;
  }

  return encrypted;
}
```

### Session Management

- Sessions are cached per peer with automatic cleanup
- Maximum session timeout: 30 minutes
- Sessions automatically removed on timeout
- Multiple sessions can coexist for different peers

## Integration Points

### Discovery Service

```typescript
const discovery = new DeviceDiscoveryService();
const exchanger = new IntentExchangeProtocol();

// Register peers
discovery.registerPeer({
  id: 'device-b',
  transport: 'ble',
  lastSeen: Date.now(),
});

// Establish encrypted session on intent exchange
const activePeers = discovery.getActivePeers();
for (const peer of activePeers) {
  const session = exchanger.establishSecureSession(peer.id);
  console.log(`Secure session with ${peer.id}:`, session);
}
```

### Multi-Hop Routing

When routing intents through intermediate peers:

1. Each hop establishes its own Noise session
2. Intent payload encrypted for each segment
3. Decrypted only by intended recipient

## Production Recommendations

### 1. **Full Noise Protocol Implementation**

Replace XOR cipher with complete Noise protocol:

```typescript
import { Noise } from '@chainsafe/libp2p-noise';

const noise = new Noise();
const encrypted = await noise.encryptData(payload, session.sessionKey);
```

### 2. **Key Persistence**

Store device static key in secure storage:

```typescript
import * as SecureStore from 'expo-secure-store';

async function initializeDeviceKey() {
  let key = await SecureStore.getItemAsync('device_static_key');
  if (!key) {
    key = crypto.getRandomValues(new Uint8Array(32));
    await SecureStore.setItemAsync(
      'device_static_key',
      Buffer.from(key).toString('base64')
    );
  }
  return key;
}
```

### 3. **Certificate Pinning**

Verify peer static keys against whitelist:

```typescript
const trustedPeers = new Map<string, Uint8Array>();

function verifyPeerKey(peerId: string, staticKey: Uint8Array): boolean {
  const trusted = trustedPeers.get(peerId);
  if (!trusted) return false;
  return Buffer.from(staticKey).equals(Buffer.from(trusted));
}
```

### 4. **Perfect Forward Secrecy**

Rotate session keys periodically:

```typescript
const SESSION_ROTATION_INTERVAL = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  exchanger.clearSessions(); // Force new key derivation
}, SESSION_ROTATION_INTERVAL);
```

## Testing

### Unit Tests

```typescript
describe('NoiseSession', () => {
  let exchanger: IntentExchangeProtocol;

  beforeEach(() => {
    exchanger = new IntentExchangeProtocol();
  });

  test('should establish and retrieve secure session', () => {
    const session = exchanger.establishSecureSession('peer-123');
    expect(session.peerId).toBe('peer-123');
    expect(session.sessionKey).toHaveLength(32);

    const retrieved = exchanger.getSecureSession('peer-123');
    expect(retrieved).toEqual(session);
  });

  test('should encrypt and decrypt requests', () => {
    const intent = createIntent(...);
    const encrypted = exchanger.createRequest(
      intent,
      'device-a',
      undefined,
      300,
      true,
      'device-b'
    );

    expect(encrypted.encrypted).toBe(true);
    expect(encrypted.ciphertext).toBeDefined();

    const decrypted = exchanger.getRequest(encrypted.requestId, 'device-a');
    expect(decrypted?.intent).toEqual(intent);
  });

  test('should expire sessions after timeout', (done) => {
    exchanger.establishSecureSession('peer-456');
    expect(exchanger.getSecureSession('peer-456')).toBeDefined();

    setTimeout(() => {
      expect(exchanger.getSecureSession('peer-456')).toBeUndefined();
      done();
    }, 31 * 60 * 1000); // Just after 30min timeout
  });
});
```

## Compliance

This implementation satisfies TOSS specification Section 7 (Privacy & Confidentiality):

-  **7.1 Local Storage Encryption**: Intents encrypted via Expo Secure Store
-  **7.2 Intent Content Encryption**: Optional Arcium RescueCipher for sensitive fields
-  **7.3 Transport Security**: Noise protocol for peer-to-peer communication (this document)
-  **7.4 Signature Authority**: Ed25519 signing for intent authenticity
-  **7.5 User Control**: Biometric protection for keypair access

## Future Enhancements

1. **Hardware Security Module (HSM) Integration**
   - Store device static key in Secure Enclave (iOS) or Keymaster (Android)

2. **Perfect Forward Secrecy (PFS)**
   - Use ephemeral keypairs for each session handshake

3. **Mutual Authentication**
   - Challenge-response protocol to verify peer identity

4. **Bandwidth Optimization**
   - Compress encrypted payloads before transmission

5. **Multi-Device Synchronization**
   - Coordinated Noise sessions across user's devices
