# Offline Transactions with Durable Nonce Accounts

## Overview

This guide covers the implementation of secure, offline transaction support using durable Solana nonce accounts with biometric protection, BLE transmission, and Noise Protocol encryption.

## Key Features

 **Durable Nonce Accounts**: Enable replay-protected offline transactions  
 **Biometric Protection**: All nonce operations require biometric authentication  
 **Secure Storage**: Nonce accounts stored in device's secure enclave  
 **BLE Fragmentation**: Automatic MTU-aware message fragmentation  
 **Noise Protocol**: End-to-end encryption for BLE transmission  
 **Transaction Caching**: Efficient offline transaction preparation  
 **Graceful Expiry**: Automatic nonce account renewal and validation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TossUser (Enhanced)                       │
├─────────────────────────────────────────────────────────────┤
│ • wallet: Main wallet address                               │
│ • nonceAccount: Durable nonce account for offline TX       │
│ • security: Biometric settings & status                    │
│ • tossFeatures: offlineTransactionsEnabled flag             │
└─────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  AuthService (Enhanced)                      │
├─────────────────────────────────────────────────────────────┤
│ • createSecureNonceAccount()                                │
│ • enableOfflineTransactions()                               │
│ • verifyNonceAccountAccess()                                │
│ • revokeNonceAccount()                                      │
└─────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              NonceAccountManager                             │
├─────────────────────────────────────────────────────────────┤
│ • createNonceAccount(): Create & store securely             │
│ • getNonceAccountSecure(): Retrieve w/ biometric           │
│ • prepareOfflineTransaction(): Create offline TX           │
│ • renewNonceAccount(): Update from blockchain              │
│ • revokeNonceAccount(): Disable account                    │
└─────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              BLETransactionHandler                           │
├─────────────────────────────────────────────────────────────┤
│ • fragmentTransaction(): Split for MTU limits              │
│ • sendFragmentedTransactionBLE(): Send w/ retries         │
│ • receiveFragmentedMessage(): Reassemble messages         │
│ • calculateCRC32(): Verify integrity                       │
└─────────────────────────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│         Custom React Hooks (useOfflineBLETransactions)      │
├─────────────────────────────────────────────────────────────┤
│ • useOfflineTransaction(): Manage offline TX creation      │
│ • useBLETransactionTransmission(): Handle BLE sending      │
│ • useNonceAccountManagement(): Manage nonce lifecycle      │
└─────────────────────────────────────────────────────────────┘
```

## Setup Guide

### 1. Create Nonce Account with Biometric Protection

```typescript
import { AuthService } from '@toss-sdk/services/authService';
import { Connection, Keypair } from '@solana/web3.js';

// Initialize connection to Solana cluster
const connection = new Connection('https://api.mainnet-beta.solana.com');

// Get user wallet keypair (after biometric unlock)
const userKeypair = await AuthService.unlockWalletWithBiometrics();

// Create nonce account (requires biometric verification)
const updatedUser = await AuthService.createSecureNonceAccount(
  currentUser,
  connection,
  userKeypair
);

// User now has:
// - updatedUser.nonceAccount: Durable nonce account info
// - updatedUser.security.biometricEnabled: true
// - updatedUser.tossFeatures.nonceAccountEnabled: true
```

### 2. Use React Hook for Offline Transactions

```typescript
import {
  useOfflineTransaction,
  useBLETransactionTransmission,
  useNonceAccountManagement,
} from '@toss-sdk/hooks/useOfflineBLETransactions';
import { SystemProgram } from '@solana/web3.js';

function OfflinePaymentScreen() {
  const { createOfflineTransaction, transaction, isReady } =
    useOfflineTransaction(user, connection);

  const { sendTransactionBLE } = useBLETransactionTransmission('ios');

  // Create offline transaction
  const handleCreateOfflineTX = async () => {
    // Requires biometric verification internally
    const tx = await createOfflineTransaction(
      [
        SystemProgram.transfer({
          fromPubkey: user.wallet.publicKey,
          toPubkey: recipientAddress,
          lamports: amount,
        }),
      ],
      {
        description: 'Payment to merchant',
        tags: ['offline', 'payment'],
      }
    );
  };

  // Send via BLE
  const handleSendViaBLE = async (device) => {
    const success = await sendTransactionBLE(
      device,
      transaction,
      async (deviceId, char, data) => {
        // Your BLE write implementation
      },
      noiseEncryptFn, // Optional Noise Protocol encryption
      false // Not an intent, it's a transaction
    );
  };

  return (
    <View>
      <Button title="Create Offline Transaction"
              onPress={handleCreateOfflineTX} />
      {isReady && (
        <Button title="Send via BLE"
                onPress={handleSendViaBLE} />
      )}
    </View>
  );
}
```

### 3. Manage Nonce Account Lifecycle

```typescript
import { useNonceAccountManagement } from '@toss-sdk/hooks/useOfflineBLETransactions';

function NonceAccountManagementScreen() {
  const {
    hasNonceAccount,
    isNonceAccountValid,
    createNonceAccount,
    renewNonceAccount,
    revokeNonceAccount,
  } = useNonceAccountManagement(user, connection);

  // Check if nonce account is still valid
  if (!isNonceAccountValid()) {
    return (
      <Button
        title="Nonce Account Expired - Renew"
        onPress={() => renewNonceAccount()}
      />
    );
  }

  return (
    <View>
      {!hasNonceAccount && (
        <Button
          title="Create Nonce Account"
          onPress={() => createNonceAccount(userKeypair)}
        />
      )}

      {hasNonceAccount && (
        <Button
          title="Revoke Nonce Account"
          onPress={() => revokeNonceAccount()}
        />
      )}
    </View>
  );
}
```

## Creating Offline Intents

```typescript
import { createOfflineIntent } from '@toss-sdk';
import { NonceAccountManager } from '@toss-sdk/client/NonceAccountManager';

async function createOfflinePaymentIntent(
  senderUser: TossUser,
  recipientUser: TossUser,
  amount: number
) {
  const connection = new Connection('https://api.mainnet-beta.solana.com');

  // Get nonce account manager
  const nonceManager = new NonceAccountManager(connection);

  // Retrieve nonce account (requires biometric auth internally)
  const nonceAccountInfo = await nonceManager.getNonceAccountSecure(
    senderUser.userId,
    async () => {
      // Biometric verification happens here
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify to access nonce account',
      });
      if (!result.success) throw new Error('Auth failed');
    }
  );

  // Create offline intent with nonce account
  const intent = await createOfflineIntent(
    senderUser,
    senderKeypair,
    recipientUser,
    amount,
    nonceAccountInfo,
    connection,
    {
      privateTransaction: false,
      expiresIn: 24 * 60 * 60, // 24 hours
    }
  );

  return intent;
}
```

## BLE Transmission with Fragmentation

```typescript
import {
  sendOfflineTransactionFragmented,
  receiveOfflineTransactionFragment,
  getBLEMTUConfig,
} from '@toss-sdk';

// Sender side
async function sendPaymentViaBLE(device, transaction, noiseEncryptFn) {
  const result = await sendOfflineTransactionFragmented(
    device,
    transaction,
    noiseEncryptFn,
    false // Not an intent
  );

  console.log(
    `Sent ${result.sentFragments}/${result.totalFragments} fragments`
  );
  if (!result.success) {
    console.error(`Failed fragments: ${result.failedFragments}`);
  }
}

// Receiver side
async function handleIncomingFragment(fragment, noiseDecryptFn) {
  const result = await receiveOfflineTransactionFragment(
    fragment,
    noiseDecryptFn
  );

  console.log(
    `Received fragment ${result.progress.received}/${result.progress.total}`
  );

  if (result.complete && result.transaction) {
    // Process complete transaction
    await processTransaction(result.transaction);
  }
}

// MTU Configuration
const mtuConfig = getBLEMTUConfig();
console.log(`Max payload: ${mtuConfig.maxPayloadSize}`);
console.log(`Chunk size: ${mtuConfig.chunkSize}`);
```

## Noise Protocol Integration

```typescript
import { initNoiseSession } from '@toss-sdk';

// Initialize Noise session with static key
const staticKey = new Uint8Array(32); // Your 32-byte static key
const noiseSession = initNoiseSession(staticKey);

// Encrypt for BLE transmission
async function encryptForBLE(data: Uint8Array) {
  const encrypted = noiseSession.encrypt(data);
  return {
    version: 1,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    tag: encrypted.tag,
  };
}

// Decrypt received message
async function decryptFromBLE(encryptedMessage) {
  return noiseSession.decrypt(
    encryptedMessage.ciphertext,
    encryptedMessage.tag
  );
}

// Use in BLE transmission
const result = await sendOfflineTransactionFragmented(
  device,
  transaction,
  encryptForBLE, // Pass encryption function
  false
);
```

## Security Considerations

### 1. Biometric Protection

-  All nonce account operations require biometric authentication
-  Keypairs stored in device's secure enclave (iOS Secure Enclave / Android Keymaster)
-  Private keys never leave secure storage
-  User cannot export or backup private keys

### 2. Replay Protection

-  Each transaction uses a unique, incrementing nonce
-  Nonce values validated on-chain before execution
-  Expired nonces automatically detected and rejected

### 3. Fragmentation & Integrity

-  Each BLE fragment includes CRC32 checksum
-  Corrupted fragments automatically rejected
-  Automatic retry with exponential backoff

### 4. Encryption

-  Noise Protocol for end-to-end encryption
-  Optional Arcium integration for transaction privacy
-  Encrypted storage in secure enclave

## Type Safety

All new types are integrated into the existing `TossUser` type:

```typescript
type TossUser = {
  // Existing fields...
  wallet: { ... }
  device: { ... }

  // New nonce account support
  nonceAccount?: {
    address: PublicKey;
    authorizedSigner: PublicKey;
    isBiometricProtected: boolean;
    status: 'active' | 'expired' | 'revoked';
  };

  // New security settings
  security: {
    biometricEnabled: boolean;
    nonceAccountRequiresBiometric: boolean;
    lastBiometricVerification?: number;
  };

  // New feature flags
  tossFeatures: {
    // ... existing flags
    offlineTransactionsEnabled?: boolean;
    nonceAccountEnabled?: boolean;
  };
}
```

## Error Handling

```typescript
import { useOfflineTransaction } from '@toss-sdk/hooks/useOfflineBLETransactions';

function PaymentScreen() {
  const { createOfflineTransaction, error, isPreparing } =
    useOfflineTransaction(user, connection);

  const handlePay = async () => {
    try {
      const tx = await createOfflineTransaction(instructions);
      if (!tx) {
        // Check error state
        console.error('Transaction creation failed:', error);
        // Possible errors:
        // - "User does not have nonce account configured"
        // - "Biometric verification failed"
        // - "Nonce account is no longer valid"
        return;
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    }
  };

  return (
    <View>
      <ActivityIndicator animating={isPreparing} />
      <Button title="Pay" onPress={handlePay} disabled={isPreparing} />
    </View>
  );
}
```

## Testing

```typescript
import { NonceAccountManager } from '@toss-sdk/client/NonceAccountManager';

async function testOfflineTransactions() {
  // Create test user
  const user = await AuthService.createSecureNonceAccount(
    testUser,
    testConnection,
    testKeypair
  );

  // Test nonce account creation
  expect(user.nonceAccount).toBeDefined();
  expect(user.tossFeatures.nonceAccountEnabled).toBe(true);

  // Test offline transaction
  const manager = new NonceAccountManager(testConnection);
  const nonceInfo = await manager.getNonceAccountSecure(user.userId);
  expect(nonceInfo).toBeDefined();
  expect(nonceInfo?.isBiometricProtected).toBe(true);

  // Test BLE fragmentation
  const handler = new BLETransactionHandler('ios');
  const fragments = handler.fragmentTransaction(testTransaction);
  expect(fragments.length).toBeGreaterThan(0);
  expect(fragments[0].checksumValue).toBeDefined();
}
```

## Migration Guide

If you're upgrading from the previous version:

### Before

```typescript
// Old way - no offline support
const intent = await createSignedIntent(
  senderKeypair,
  recipientAddress,
  amount,
  connection
);
```

### After

```typescript
// New way - with offline support
const intent = await createOfflineIntent(
  senderUser,
  senderKeypair,
  recipientUser,
  amount,
  nonceAccountInfo,
  connection
);
```

The old `createSignedIntent` and `createIntent` functions still work, but for offline transactions, use `createOfflineIntent` instead.
