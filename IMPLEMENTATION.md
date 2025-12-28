# TOSS Expo SDK - Implementation Guide

This document outlines the implementation of the TOSS (The Offline Solana Stack) protocol as described in the technical paper, with specific reference to which sections have been implemented.

## Implementation Status

###  Completed Sections

#### Section 4: Intent-Based Transaction Architecture

- **Status**: Complete
- **Files**: `src/intent.ts`, `src/intentManager.ts`
- **Exports**: `createIntent()`, `createSignedIntent()`, `verifyIntent()`, `SolanaIntent`
- **Features**:
  - Cryptographically signed transaction intents
  - Nonce-based replay protection
  - Time-bounded expiry validation
  - Deterministic intent generation

#### Section 5: Transport and Connectivity Layer

- **Status**: Complete
- **Files**: `src/ble.ts`, `src/nfc.ts`, `src/qr.tsx`, `src/noise.ts`
- **Exports**: BLE/NFC/QR scanner functions, Noise protocol initialization
- **Features**:
  - Bluetooth Low Energy device scanning and communication
  - NFC read/write capabilities
  - QR code scanning for air-gapped exchange
  - Noise protocol for secure sessions

#### Section 6: Cryptographic Model

- **Status**: Complete
- **Files**: `src/intent.ts`, `src/services/authService.ts`
- **Features**:
  - Native Solana keypair signing (tweetnacl)
  - No custodial key storage
  - Biometric-protected wallet unlock
  - Non-delegated signing

#### Section 7: Confidential Execution via Arcium

- **Status**: Complete
- **Files**: `src/internal/arciumHelper.ts`
- **Exports**: `encryptForArciumInternal()`
- **Features**:
  - Confidential intent construction
  - x25519 key exchange
  - RescueCipher encryption
  - Pre-settlement metadata protection

#### Section 8: Local State Management

- **Status**: Complete
- **Files**: `src/storage/secureStorage.ts`, `src/storage.ts`
- **Exports**: `secureStoreIntent()`, `getAllSecureIntents()`, `removeSecureIntent()`
- **Features**:
  - Encrypted local storage via expo-secure-store
  - Append-only intent ledger
  - Intent tracking by ID
  - Secure key management

#### Section 9: Synchronisation and Reconciliation

- **Status**: Complete
- **Files**: `src/sync.ts`, `src/reconciliation.ts`
- **Exports**: `syncToChain()`, `reconcilePendingIntents()`, `checkSyncStatus()`
- **Features**:
  - Full reconciliation workflow
  - Transaction building from intents
  - Onchain state validation
  - Deterministic settlement
  - Settlement result tracking

#### Section 10: Failure and Conflict Handling

- **Status**: Complete
- **Files**: `src/reconciliation.ts`, `src/discovery.ts`
- **Exports**: `detectConflicts()`, `MultiDeviceConflictResolver`
- **Features**:
  - Balance validation
  - Nonce constraint checking
  - Expiry validation during sync
  - Deterministic rollback logic
  - Double-spend detection
  - Multi-device conflict resolution

#### Section 11: Developer Stack

- **Status**: Complete
- **Files**: `src/client/TossClient.ts`
- **Exports**: `TossClient`, helper methods for all SDK primitives
- **Features**:
  - Intent construction and signing
  - Offline verification
  - Device discovery
  - Secure local persistence
  - Synchronisation hooks
  - Error handling with detailed codes

#### Section 12: Example Flow - Offline Payment

- **Status**: Complete
- **Files**: `src/examples/offlinePaymentFlow.ts`
- **Exports**: Complete example functions
- **Features**:
  - End-to-end offline payment flow
  - Peer discovery and exchange
  - Multi-device conflict handling
  - Full sync and settlement walkthrough

#### Section 13: Security Guarantees

- **Status**: Complete
- **Implementation**: Built into protocol throughout
- **Features**:
  - No unauthorized signing (keypair-based)
  - No offline state mutation (append-only storage)
  - No forced execution (deterministic validation)
  - Deterministic settlement (conflict resolution rules)
  - Confidential pre-settlement (Arcium integration)

###  New Modules Added

#### `src/reconciliation.ts`

Core reconciliation engine implementing Sections 9-10 of the paper.

**Key Functions**:

- `validateIntentOnchain()` - Validates intent against current Solana state
- `buildTransactionFromIntent()` - Constructs Solana transaction from intent
- `submitTransactionToChain()` - Submits and confirms transaction
- `settleIntent()` - Single intent settlement with result tracking
- `reconcilePendingIntents()` - Batch reconciliation of all pending intents
- `detectConflicts()` - Identifies conflicts between local and onchain state
- `getReconciliationState()` - Returns summary of reconciliation status

**Types**:

- `SettlementResult` - Result of settlement attempt for a single intent
- `ReconciliationState` - Summary of device reconciliation state

#### `src/discovery.ts`

Device discovery and intent exchange protocol implementation.

**Key Classes**:

- `DeviceDiscoveryService` - Manages discovered peer devices
- `IntentExchangeProtocol` - Handles request/response exchanges
- `IntentRoutingService` - Multi-hop routing for mesh scenarios
- `MultiDeviceConflictResolver` - Deterministic conflict resolution

**Key Functions**:

- `registerPeer()` - Add discovered device to peers
- `getActivePeers()` - Get devices not yet timed out
- `createRequest()` - Create intent exchange request
- `createResponse()` - Respond to exchange request
- `detectConflicts()` - Find duplicate intents
- `resolveConflicts()` - Deterministic winner selection

#### `src/sync.ts` (Enhanced)

Updated synchronisation module with full reconciliation workflow.

**Key Functions**:

- `syncToChain()` - **NEW**: Full sync with conflict detection and settlement
- `checkSyncStatus()` - **NEW**: Lightweight status check without settlement

**Returns**: `SyncResult` with detailed settlement and conflict information

#### `src/examples/offlinePaymentFlow.ts`

Comprehensive examples demonstrating the full TOSS flow.

**Example Functions**:

- `exampleInitiateOfflinePayment()` - Create and store intent offline
- `exampleExchangeIntentWithPeer()` - Exchange intent with nearby device
- `exampleMultiDeviceConflict()` - Handle conflicting intents
- `exampleCompleteOfflineFlow()` - End-to-end flow demonstration
- `exampleVerifyIntentBeforeAcceptance()` - Verify intent signatures

#### `src/client/TossClient.ts` (Enhanced)

Extended with new synchronisation methods.

**New Methods**:

- `fullSync()` - Execute complete reconciliation (Section 9)
- `checkSyncStatus()` - Query reconciliation state
- `detectIntentConflicts()` - Find conflicts before settling
- `getReconciliationStatus()` - Get detailed status summary

## Usage Examples

### Creating an Offline Intent

```typescript
import { TossClient } from 'toss-expo-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

const client = TossClient.createClient({
  projectId: 'my-app',
  mode: 'devnet',
});

// Create intent (offline, no network needed)
const senderKeypair = Keypair.generate();
const intent = await client.createIntent(
  senderKeypair,
  new PublicKey('11111111111111111111111111111111'),
  1000000, // 1 SOL in lamports
  {
    memo: 'Payment',
    useDurableNonce: true,
  }
);

console.log(`Intent created: ${intent.id}`);
```

### Exchanging with Peer Device

```typescript
import {
  deviceDiscovery,
  intentExchange,
  type PeerDevice,
} from 'toss-expo-sdk';

// Discover peer
const peer: PeerDevice = {
  id: 'device_peer_001',
  lastSeen: Date.now(),
  transport: 'ble',
};

deviceDiscovery.registerPeer(peer);

// Create exchange request
const request = intentExchange.createRequest(intent, 'my_device_id');

// Simulate peer accepting
const response = intentExchange.createResponse(
  request.requestId,
  peer.id,
  'accepted',
  undefined,
  [intent.id]
);

console.log(`Peer accepted: ${response.status}`);
```

### Full Reconciliation with Blockchain

```typescript
import { syncToChain } from 'toss-expo-sdk';
import { Connection } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com');

// When device reconnects to internet
const syncResult = await syncToChain(connection);

console.log(`Settled: ${syncResult.successfulSettlements.length}`);
console.log(`Failed: ${syncResult.failedSettlements.length}`);
console.log(`Conflicts: ${syncResult.detectedConflicts.length}`);

// Handle failures
for (const failed of syncResult.failedSettlements) {
  console.error(`Intent ${failed.intentId}: ${failed.error}`);
}

// Handle conflicts
for (const conflict of syncResult.detectedConflicts) {
  console.warn(`Conflict in ${conflict.intentId}: ${conflict.conflict}`);
}
```

### Detecting and Resolving Multi-Device Conflicts

```typescript
import { MultiDeviceConflictResolver } from 'toss-expo-sdk';

// When multiple devices create same intent
const conflicts = MultiDeviceConflictResolver.detectConflicts([
  intentFromDeviceA,
  intentFromDeviceB,
]);

for (const conflictGroup of conflicts) {
  const resolution =
    MultiDeviceConflictResolver.resolveConflicts(conflictGroup);
  console.log(`Winner: ${resolution.winner.id}`);
  console.log(`Losers: ${resolution.losers.map((i) => i.id)}`);
}
```

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│     TOSS Expo SDK Architecture          │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   Application Layer             │   │
│  │  (Developer code)               │   │
│  └──────────┬──────────────────────┘   │
│             │                          │
│  ┌──────────▼──────────────────────┐   │
│  │  TossClient (Interface)         │   │
│  │  - createIntent()               │   │
│  │  - fullSync()                   │   │
│  │  - detectIntentConflicts()      │   │
│  └──────────┬──────────────────────┘   │
│             │                          │
│  ┌──────────┴──────────────────────┐   │
│  │  Core Modules                   │   │
│  ├──────────────────────────────────┤   │
│  │ Intent (4)  ← Creation & Signing │   │
│  │ Transport (5) ← BLE/NFC/QR       │   │
│  │ Crypto (6) ← Signing & Keys      │   │
│  │ Arcium (7) ← Confidentiality    │   │
│  │ Storage (8) ← Append-only Log    │   │
│  │ Reconciliation (9) ← Settlement  │   │
│  │ Conflict (10) ← Resolution       │   │
│  │ Discovery (11) ← Device Peers    │   │
│  │ Exchange (12) ← Intent Protocol  │   │
│  └──────────┬──────────────────────┘   │
│             │                          │
│  ┌──────────▼──────────────────────┐   │
│  │  Storage Layer                  │   │
│  │  - Secure Key Management        │   │
│  │  - Encrypted Intent Ledger      │   │
│  └──────────┬──────────────────────┘   │
│             │                          │
│  ┌──────────▼──────────────────────┐   │
│  │  Network (When Available)       │   │
│  │  - Solana RPC Connection        │   │
│  │  - Blockchain Settlement        │   │
│  └──────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

## Key Invariants Maintained

As per TOSS Section 3, these invariants are maintained:

1.  **Onchain state is canonical** - All final state changes only happen on Solana
2.  **Offline execution never mutates global state** - Local storage is append-only
3.  **All offline artifacts are verifiable onchain** - Intent signatures checked during settlement
4.  **No trusted relayers or delegated signing** - Only user's keypair signs
5.  **Failure must be deterministic and safe** - Conflict resolver uses deterministic rules
6.  **Privacy is preserved prior to settlement** - Arcium integration for confidential intents

## Error Codes

New error codes added for reconciliation and conflict handling:

- `EXCHANGE_REQUEST_NOT_FOUND` - Intent exchange request doesn't exist
- `EXCHANGE_REQUEST_EXPIRED` - Exchange request has passed expiry time
- `ROUTE_TOO_LONG` - Routing path exceeds maximum hops
- `TRANSACTION_BUILD_FAILED` - Failed to build transaction from intent
- `NO_INTENTS` - No intents to process

See `src/errors.ts` for complete list.

## Testing Recommendations

1. **Unit Tests**: Intent creation, signing, verification
2. **Integration Tests**: Full offline-to-settlement flow
3. **Multi-Device Tests**: Conflict detection and resolution
4. **Network Tests**: Reconciliation with various network states
5. **Security Tests**: Signature verification, replay protection

## Performance Considerations

- Intent storage: O(1) per intent
- Reconciliation: O(n) where n = number of pending intents
- Conflict detection: O(n²) in worst case, O(n log n) expected
- Network requests: Batched where possible

## Future Improvements

1. **Batch Settlement Optimization** - Group multiple intent settlements
2. **Predictive Sync** - Estimate settlement success before submitting
3. **Partial Settlement** - Handle mixed success/failure in batch
4. **Intent Composability** - Chain intents together
5. **Smart Routing** - Automatic peer selection for mesh scenarios
