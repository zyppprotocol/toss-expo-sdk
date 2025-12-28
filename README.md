# TOSS Expo SDK

**TOSS (The Offline Solana Stack)** implements the complete [TOSS Technical Paper](./TOSS_PAPER_IMPLEMENTATION_VERIFICATION.md) — a protocol-correct approach to building offline-first Solana applications without compromising security or finality guarantees.

[![npm version](https://img.shields.io/npm/v/toss-expo-sdk)](https://www.npmjs.com/package/toss-expo-sdk)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Solana, extended.** TOSS introduces deterministic separation between transaction intent creation and onchain settlement, enabling applications to function seamlessly in disconnected environments while preserving Solana's security model.

##  Features

### Core Capabilities

- **Offline-First Architecture**: Create and process transactions without immediate network access
- **Durable Nonce Accounts**: Replay-protected offline transactions with automatic expiry handling
- **Secure Wallet Integration**: Built-in wallet management with biometric protection
- **BLE Transaction Transmission**: MTU-aware message fragmentation with automatic retry
- **End-to-End Encryption**: Noise Protocol integration for secure device-to-device communication
- **TypeScript Support**: Full TypeScript definitions for better developer experience

### Security

-  Biometric-protected nonce accounts (mandatory)
-  Hardware-backed secure key storage (Secure Enclave / Keymaster)
-  Automatic replay protection with durable nonces
-  Noise Protocol encryption for BLE transmission
-  CRC32 checksums for fragment verification
-  Non-custodial by design - users maintain control of their keys

### Developer Experience

- Simple, intuitive API for offline transactions
- Custom React hooks for easy integration (`useOfflineTransaction`, `useBLETransactionTransmission`)
- Comprehensive error handling with detailed messages
- Built-in retry mechanisms with exponential backoff
- Automatic MTU negotiation and fragmentation

##  Installation

```bash
# Using npm
npm install toss-expo-sdk

# Using yarn
yarn add toss-expo-sdk
```

All dependencies (Solana Web3.js, Arcium, Noise Protocol, etc.) are automatically included.

##  System Model & Design Principles

**TOSS operates under these assumptions:**

- Devices may be **offline for arbitrary durations**
- Transport channels are **unreliable and potentially adversarial**
- Devices are **not mutually trusted**
- **Onchain state is the sole authority** for settlement
- Offline execution is limited to **cryptographically verifiable intent generation only**

**TOSS maintains these invariants:**

-  Onchain state is canonical
-  Offline execution never mutates global state
-  All offline artifacts are cryptographically verifiable onchain
-  No trusted relayers or delegated signing
-  Failure is deterministic and safe
-  Privacy is preserved prior to settlement

**Violation of any invariant invalidates the offline model.**

##  Quick Start

### Initialize the Client

Recommended: use the `createClient` helper for concise initialization.

```typescript
import { createClient } from 'toss-expo-sdk';

const client = createClient({
  projectId: 'your-project-id',
  mode: 'devnet', // or 'testnet' | 'mainnet-beta'
  privateTransactions: true,
  maxRetries: 3,
  retryDelay: 1000,
});
```

Or, you may call the static constructor directly if you prefer:

```typescript
import { TossClient } from 'toss-expo-sdk';
const client = TossClient.createClient({ projectId: 'your-project-id' });
```

### Create and Sign an Intent

Prefer the user-centric API which accepts `TossUser` objects and validates user features.

> Note: There are two common ways to create a user intent:
>
> - `createUserIntent(senderUser, senderKeypair, recipientUser, amount, connection, options)` — top-level helper suitable for scripts or when you have both user objects and the signing `Keypair` available.
> - `TossClient.createUserIntent(senderKeypair, recipient, amount, options)` — an instance method used when working with a `TossClient`. This requires an explicit `Keypair` for signing (TossClient is framework-agnostic). For React apps, prefer unlocking the wallet via `WalletProvider` and calling the top-level `createUserIntent` with the unlocked `Keypair`.

```typescript
import {
  createUserIntent,
  createSignedIntent, // legacy: accepts Keypair + PublicKey
  secureStoreIntent,
  syncToChain,
} from 'toss-expo-sdk';
import { Connection } from '@solana/web3.js';
import type { TossUser } from 'toss-expo-sdk';

const connection = new Connection('https://api.devnet.solana.com');

// Example using TossUser objects
const intent = await createUserIntent(
  senderUser, // TossUser (includes wallet.publicKey and features)
  senderKeypair, // Keypair object for signing (must match senderUser.wallet)
  recipientUser, // TossUser
  amountInLamports,
  connection,
  { expiresIn: 60 * 60, privateTransaction: true }
);

// Store intent locally
await secureStoreIntent(intent);

// Later, when online, sync to Solana
const syncResult = await syncToChain(connection);
console.log(`Settled: ${syncResult.successfulSettlements.length}`);

// Legacy: If you already have an address and Keypair, use createSignedIntent
const legacyIntent = await createSignedIntent(
  senderKeypair,
  recipientPublicKey,
  amountInLamports,
  connection
);
```

### Using with React Native

```typescript
import { WalletProvider, useWallet, createUserIntent, secureStoreIntent, syncToChain } from 'toss-expo-sdk';
import { View, Button } from 'react-native';

function App() {
  return (
    <WalletProvider>
      <PaymentScreen />
    </WalletProvider>
  );
}

function PaymentScreen() {
  const {
    isUnlocked,
    unlockWallet,
    lockWallet,
    keypair,
    user,
  } = useWallet();

  const handlePay = async (recipientUser, amountLamports, connection) => {
    if (!isUnlocked || !keypair || !user) {
      // Ensure wallet is unlocked and keypair is available
      const ok = await unlockWallet();
      if (!ok) throw new Error('Wallet is locked');
    }

    // Create intent using unlocked keypair and TossUser context
    const intent = await createUserIntent(user, keypair, recipientUser, amountLamports, connection);
    await secureStoreIntent(intent);

    // Optionally trigger sync when online
    // await syncToChain(connection);

    return intent;
  };

  return (
    <View>
      <Button
        title={isUnlocked ? 'Lock Wallet' : 'Unlock Wallet'}
        onPress={() => (isUnlocked ? lockWallet() : unlockWallet())}
      />
    </View>
  );
}
```

## Core Idea: Intent, Not Transaction

TOSS uses an **intent-based model** that fundamentally separates cryptographic commitment from onchain execution.

An **intent** is:

- A **signed declaration** of what a user wants to do
- **Transferable offline** via BLE, NFC, QR, or local mesh
- **Verifiable locally** without network access (signature, expiry, nonce only)
- **Settled later on-chain** where Solana enforces final state transitions

This separation allows applications to function **without connectivity** while preserving Solana's security guarantees.

### The 4-Phase Intent Lifecycle

TOSS follows a deterministic 4-phase model (Section 4.3 of Technical Paper):

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: CREATION (Offline)                                     │
│ • Sender constructs intent locally                              │
│ • Signs with native Solana keypair (Ed25519)                   │
│ • No network required                                           │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 2: EXCHANGE (Offline)                                     │
│ • Signed intent transmitted via proximity (BLE/NFC/QR)         │
│ • Transport integrity not trusted                              │
│ • Peer receives intent in untrusted environment               │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 3: OFFLINE VERIFICATION (Offline)                         │
│ • Verify signature correctness (Ed25519)                        │
│ • Check expiry bounds                                           │
│ • Validate nonce (replay protection)                            │
│ • DEFERRED: Balance, program constraints (onchain only)        │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 4: SETTLEMENT (Online)                                    │
│ • Connectivity restored                                         │
│ • Intent submitted to Solana                                   │
│ • Program verifies signature + state                           │
│ • Settlement succeeds or fails deterministically               │
└─────────────────────────────────────────────────────────────────┘
```

**Key Invariant:** At no stage does offline execution bypass Solana's runtime or programs. Final state transitions occur **exclusively on Solana**.

---

##  Local State Management & Reconciliation

TOSS maintains an **encrypted, append-only local intent store** that enables offline operation while waiting for network connectivity.

### What Gets Stored Locally

Each device maintains:

- **Outbound pending intents** - Intents created but not yet settled
- **Inbound received intents** - Intents from peers, awaiting verification
- **Synchronization status** - Track which intents have been submitted
- **Expiry metadata** - Automatic cleanup of expired intents

```typescript
import {
  secureStoreIntent,
  getPendingIntents,
  getAllSecureIntents,
} from 'toss-expo-sdk';

// Store an intent locally (encrypted in hardware secure enclave)
await secureStoreIntent(intent);

// Get all pending intents
const pending = await getPendingIntents();
console.log(`${pending.length} intents waiting for settlement`);

// Later, when online...
const allIntents = await getAllSecureIntents();
console.log(`Stored intents: ${allIntents.length}`);
```

### Automatic Reconciliation

When connectivity is restored, TOSS initiates **deterministic reconciliation**:

```typescript
import { syncToChain, reconcilePendingIntents } from 'toss-expo-sdk';

// Sync all pending intents to Solana
const syncResult = await syncToChain(connection);

console.log(`Settled: ${syncResult.successfulSettlements.length}`);
console.log(`Failed: ${syncResult.failedSettlements.length}`);
console.log(`Conflicts detected: ${syncResult.detectedConflicts.length}`);
```

**Reconciliation Steps:**

1.  Retrieve all pending intents from local storage
2.  Submit to Solana
3.  Verify signatures and state constraints onchain
4.  Deterministically reject invalid or conflicting intents
5.  Update local state with finality

**No offline state is treated as final.** Solana's verdict is authoritative.

---

##  Confidential Execution via Arcium (Optional)

TOSS integrates **Arcium** for confidential computation in pre-settlement stages, protecting sensitive transaction parameters before onchain execution.

### When to Use Private Transactions

By default, intents are created as regular transactions. Use `privateTransaction: true` when:

- You want to hide **transaction amounts** from peers during exchange
- You need to hide **recipient information** before settlement
- You're working with **sensitive business logic** (payments, transfers)
- You need **pre-settlement confidentiality** without revealing intent details

### Enabling Confidential Execution

```typescript
import { createUserIntent, createIntent } from 'toss-expo-sdk';
import { Provider } from '@project-serum/anchor';

// Confidential intent creation
const confidentialIntent = await createUserIntent(
  senderUser,
  senderKeypair,
  recipientUser,
  amountInLamports,
  connection,
  {
    privateTransaction: true,
    mxeProgramId: new PublicKey('YOUR_MXE_PROGRAM_ID'),
    provider: anchorProvider, // Anchor provider for MXE operations
    expiresIn: 60 * 60, // 1 hour expiry
  }
);

console.log('Intent created with Arcium encryption');
console.log(`Encrypted data: ${confidentialIntent.encrypted?.ciphertext}`);
```

### How It Works

1. **Pre-Creation:** Construct intent with plaintext values
2. **Encryption:** Amount and metadata encrypted with Arcium
3. **Storage:** Encrypted intent stored locally
4. **Exchange:** Encrypted parameters transmitted (peer cannot decrypt)
5. **Settlement:** Solana program decrypts and executes (onchain verification)

### Security Model

- **Encryption scope:** Optional (amount, metadata)
- **Key management:** Arcium handles encryption/decryption
- **Signature:** Intent signature covers plaintext (authenticity verified before decryption)
- **Onchain verification:** Only Solana MXE program can decrypt and validate

**Important:** Arcium encryption is **optional** and operates strictly before onchain execution. It does **not** alter Solana's trust model — the blockchain remains the final authority.

---

TOSS now includes **production-ready offline transaction support** using Solana's durable nonce accounts with biometric protection.

### Quick Start: Offline Transactions

```typescript
import {
  useOfflineTransaction,
  useBLETransactionTransmission,
  useNonceAccountManagement,
  createOfflineIntent,
  AuthService,
} from 'toss-expo-sdk';
import { SystemProgram } from '@solana/web3.js';

// Step 1: Create nonce account (requires biometric)
const updatedUser = await AuthService.createSecureNonceAccount(
  user,
  connection,
  userKeypair
);

// Step 2: Create offline transaction using custom hook
const { createOfflineTransaction } = useOfflineTransaction(user, connection);

const offlineTx = await createOfflineTransaction([
  SystemProgram.transfer({
    fromPubkey: user.wallet.publicKey,
    toPubkey: recipientAddress,
    lamports: amount,
  }),
]);

// Step 3: Send via BLE with automatic fragmentation
const { sendTransactionBLE } = useBLETransactionTransmission('ios');

const result = await sendTransactionBLE(
  bleDevice,
  offlineTx,
  noiseEncryptFn, // Optional Noise Protocol encryption
  false // This is a transaction, not an intent
);

console.log(`Sent ${result.sentFragments}/${result.totalFragments} fragments`);
```

### Key Features

**Biometric Protection**

-  All nonce operations require biometric authentication
-  Private keys stored in device's secure enclave (iOS Secure Enclave / Android Keymaster)
-  User cannot export or backup private keys

**Replay Protection**

-  Each transaction uses a unique, incrementing nonce from the blockchain
-  Nonce values automatically validated before transaction execution
-  Expired nonces automatically detected and rejected

**BLE Transmission**

-  Automatic MTU-aware message fragmentation
-  CRC32 checksum verification for each fragment
-  Automatic retry with exponential backoff
-  Noise Protocol encryption support

**Storage & Renewal**

-  Nonce accounts cached efficiently in memory
-  Automatic renewal from blockchain
-  Graceful expiry handling with status tracking

### Detailed Guide

For comprehensive documentation, guides, and advanced usage examples, see [OFFLINE_TRANSACTIONS_GUIDE.md](./OFFLINE_TRANSACTIONS_GUIDE.md).

Topics covered:

- Architecture overview
- Setup guide with step-by-step examples
- Custom React hooks API reference
- Noise Protocol integration
- Security considerations
- Error handling patterns
- Testing strategies
- Migration guide from previous versions

---

##  Security

### TOSS Security Guarantees

TOSS guarantees (per Technical Paper, Section 13):

1. **No Unauthorized Signing**
   - Only users with access to their private keys can create intents
   - Ed25519 signatures cannot be forged
   - Biometric protection for nonce accounts (mandatory)

2. **No Offline State Mutation**
   - Offline operations only create local intents (append-only store)
   - No global state changes until onchain settlement
   - Solana remains the sole authority for state transitions

3. **No Forced Execution**
   - Signers can choose whether to submit intents
   - Intents can be rejected before settlement
   - Both parties must verify before committing to offline transfer

4. **Deterministic Settlement**
   - Settlement outcomes are deterministic based on onchain state
   - Conflict resolution is deterministic (nonce + timestamp)
   - Failures are safe and recoverable

5. **Confidential Pre-Settlement Handling**
   - Optional Arcium encryption before submission
   - Private transaction metadata protected from peers
   - Onchain verification ensures integrity

**Important:** Offline capability does **not** expand Solana's attack surface. All security guarantees come from cryptography and onchain verification, not the offline layer.

### Best Practices

1. Always verify transaction details before signing
2. Use the latest version of the SDK
3. Never expose private keys in client-side code
4. Implement proper error handling

### Error Handling

The SDK provides detailed error codes for handling various scenarios. All errors extend from the base `TossError` class and include a `code` property for programmatic handling.

#### Error Codes Reference

| Error Code                      | Description                        | When It Occurs                                                   |
| ------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `INVALID_INTENT`                | The intent is malformed or invalid | When validating an intent fails due to invalid structure or data |
| `NETWORK_ERROR`                 | Network-related operation failed   | When a network request fails or times out                        |
| `STORAGE_ERROR`                 | Local storage operation failed     | When reading/writing to secure storage fails                     |
| `SIGNATURE_VERIFICATION_FAILED` | Signature verification failed      | When a signature doesn't match the expected value                |
| `INTENT_EXPIRED`                | The intent has expired             | When processing an intent that's past its expiration time        |
| `INSUFFICIENT_FUNDS`            | Not enough funds for the operation | When an account has insufficient balance                         |
| `TRANSACTION_FAILED`            | Transaction processing failed      | When a transaction is rejected by the network                    |

#### Error Handling Example

```typescript
import { TossError } from 'toss-expo-sdk';

try {
  const intent = await createSignedIntent(...);
  await secureStoreIntent(intent);
} catch (error) {
  if (error instanceof TossError) {
    switch (error.code) {
      case 'INSUFFICIENT_FUNDS':
        console.error('Insufficient funds for this transaction');
        break;
      case 'INTENT_EXPIRED':
        console.error('This transaction intent has expired');
        break;
      case 'NETWORK_ERROR':
        console.error('Network error occurred. Please check your connection.');
        break;
      default:
        console.error(`Error [${error.code}]: ${error.message}`);
    }
  } else {
    console.error('An unexpected error occurred:', error);
  }
}
```

#### Error Object Structure

All errors have the following structure:

```typescript
{
  name: string;        // Error class name (e.g., 'NetworkError')
  message: string;     // Human-readable error message
  code: string;        // Error code (from ERROR_CODES)
  details?: any;       // Additional error details (if any)
  cause?: Error;       // Original error that caused this one (if any)
}
```

##  Synchronisation and Settlement

TOSS implements deterministic synchronisation (Section 9 of the technical paper) when devices reconnect to the network.

### Full Synchronisation Flow

```typescript
import { syncToChain } from 'toss-expo-sdk';
import { Connection } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com');

// When your device reconnects to internet
const syncResult = await syncToChain(connection);

// Handle settlements
console.log(`Successfully settled: ${syncResult.successfulSettlements.length}`);
console.log(`Failed settlements: ${syncResult.failedSettlements.length}`);
console.log(`Detected conflicts: ${syncResult.detectedConflicts.length}`);

// Check individual failures
for (const failed of syncResult.failedSettlements) {
  console.error(`Intent ${failed.intentId} failed: ${failed.error}`);
}

// Handle conflicts
for (const conflict of syncResult.detectedConflicts) {
  console.warn(`Conflict in ${conflict.intentId}: ${conflict.conflict}`);
}
```

### Conflict Detection and Resolution

When multiple devices are offline and create conflicting intents, TOSS automatically resolves them deterministically:

```typescript
import { MultiDeviceConflictResolver } from 'toss-expo-sdk';

// If multiple devices created the same intent
const conflicts = MultiDeviceConflictResolver.detectConflicts([
  intentFromDeviceA,
  intentFromDeviceB,
]);

// Deterministically resolve using:
// 1. Lowest nonce (replay protection)
// 2. Earliest timestamp (fairness)
// 3. Lexicographic signature (tiebreak)
const resolution = MultiDeviceConflictResolver.resolveConflicts(conflicts[0]);

console.log(`Winner: ${resolution.winner.id}`);
console.log(`Losers: ${resolution.losers.map((i) => i.id)}`);
```

### Device Discovery and Peer Exchange

Devices can discover and exchange intents with nearby peers:

```typescript
import { DeviceDiscoveryService, startTossScan } from 'toss-expo-sdk';

const discovery = new DeviceDiscoveryService();

// Scan for nearby TOSS devices via BLE
startTossScan(
  (user, device) => {
    // Register discovered peer
    discovery.registerPeer({
      id: device.id,
      user,
      lastSeen: Date.now(),
      transport: 'ble',
    });
    console.log(`Peer discovered: ${device.id}`);
  },
  (intent, device) => {
    console.log(`Received intent from ${device.id}`);
  }
);

// Get active peers
const activePeers = discovery.getActivePeers();
console.log(`${activePeers.length} active peers nearby`);
```

## ️ Understanding TOSS Limitations

TOSS is designed to fail safely. The following limitations are **by design** and fundamental to any offline system:

### What TOSS Does NOT Do

 **Does not resolve offline double-spend**

- Multiple devices can create conflicting intents offline
- Conflicts are resolved deterministically onchain (first valid intent wins)
- You must verify transaction details before committing to offline transfer

 **Does not guarantee settlement success**

- Intents may fail onchain due to insufficient balance, nonce violations, or expired intents
- Settlement is deterministic but failures can occur
- Always check sync results for failed intents

 **Does not replace Solana consensus**

- TOSS extends operational boundaries but does not modify Solana's execution semantics
- All final state transitions occur exclusively on Solana
- Transaction validity is determined by Solana's runtime, not TOSS

 **Does not eliminate finality dependency on network**

- Finality still requires network connectivity to Solana
- Offline operation defers settlement, not finality
- You cannot validate final state without connectivity

### Settlement Guarantees

TOSS **guarantees**:

-  Signatures cannot be forged (Ed25519 cryptography)
-  Offline state never mutates global state (local-only storage)
-  All artifacts are verifiable onchain (deterministic settlement)
-  Conflicts resolve deterministically (based on nonce and timestamp)
-  Pre-settlement confidentiality via Arcium (optional)

But TOSS **does not guarantee**:

-  That your intent will successfully settle (dependent on onchain state)
-  Prevention of offline double-spend (conflicts detected onchain)
-  Immediate finality (requires network connectivity)

**The distinction:** TOSS guarantees **protocol correctness**, not **settlement success**. These are different requirements.

---

##  Network Support

| Network | Status  | RPC Endpoint                        |
| ------- | ------- | ----------------------------------- |
| Devnet  |  Live | https://api.devnet.solana.com       |
| Testnet |  Live | https://api.testnet.solana.com      |
| Mainnet |  Live | https://api.mainnet-beta.solana.com |

##  Complete Documentation

For comprehensive information, see:

- [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md) - Complete documentation guide
- [TOSS_PAPER_IMPLEMENTATION_VERIFICATION.md](./TOSS_PAPER_IMPLEMENTATION_VERIFICATION.md) - TOSS paper compliance
- [PAPER_VS_IMPLEMENTATION_AUDIT.md](./PAPER_VS_IMPLEMENTATION_AUDIT.md) - Detailed technical audit
- [USER_SECURITY_AND_KEY_MANAGEMENT.md](./USER_SECURITY_AND_KEY_MANAGEMENT.md) - Security model and biometric protection
# toss-expo-sdk
# toss-expo-sdk
