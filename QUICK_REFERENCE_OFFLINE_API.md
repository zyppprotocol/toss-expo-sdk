# Quick Reference: Offline Transactions API

## TL;DR - Get Started in 3 Steps

### 1️⃣ Create Nonce Account

```typescript
const user = await AuthService.createSecureNonceAccount(
  user,
  connection,
  keypair
);
// User now has: user.nonceAccount, user.security.biometricEnabled
```

### 2️⃣ Create Offline Transaction

```typescript
const { createOfflineTransaction } = useOfflineTransaction(user, connection);
const tx = await createOfflineTransaction([instruction]);
```

### 3️⃣ Send via BLE

```typescript
const { sendTransactionBLE } = useBLETransactionTransmission('ios');
await sendTransactionBLE(device, tx, encryptFn);
```

---

## Type Reference

### NonceAccountInfo

```typescript
{
  address: string; // Nonce account address
  owner: string; // Account owner
  authorizedSigner: string; // Who can use this nonce
  currentNonce: number; // Current nonce value
  lastUsedNonce: number; // Last consumed nonce
  blockhash: string; // Associated blockhash
  isBiometricProtected: boolean; // Requires biometric
  createdAt: number; // Unix timestamp
  lastModified: number; // Unix timestamp
  isStoredSecurely: boolean; // In secure enclave
}
```

### OfflineTransaction

```typescript
{
  id: string;                         // Unique TX ID
  nonceAccount: string;               // Nonce account address
  nonce: number;                      // Nonce value to use
  transaction: string;                // Serialized TX
  signature?: string;                 // Optional signature
  status: 'prepared'|'signed'|..;     // TX status
  createdAt: number;                  // Unix timestamp
  expiresAt: number;                  // Expiry timestamp
  metadata?: object;                  // Custom metadata
}
```

### Enhanced TossUser

```typescript
{
  // ... existing fields
  nonceAccount?: {
    address: PublicKey;
    authorizedSigner: PublicKey;
    isBiometricProtected: boolean;
    status: 'active' | 'expired' | 'revoked';
  };
  security: {
    biometricEnabled: boolean;
    biometricSalt?: string;
    nonceAccountRequiresBiometric: boolean;
    lastBiometricVerification?: number;
  };
  tossFeatures: {
    // ... existing features
    offlineTransactionsEnabled?: boolean;
    nonceAccountEnabled?: boolean;
  };
}
```

---

## AuthService API

### Create Nonce Account

```typescript
const user = await AuthService.createSecureNonceAccount(
  user: TossUser,
  connection: Connection,
  userKeypair: Keypair
): Promise<TossUser>
```

**Requires:** Biometric authentication  
**Returns:** Updated user with nonce account

### Enable Offline Transactions

```typescript
const user = await AuthService.enableOfflineTransactions(
  user: TossUser
): Promise<TossUser>
```

**Requires:** Nonce account + biometric enabled

### Verify Nonce Access

```typescript
const hasAccess = await AuthService.verifyNonceAccountAccess(
  userId: string
): Promise<boolean>
```

**Requires:** Biometric authentication

### Revoke Nonce Account

```typescript
const user = await AuthService.revokeNonceAccount(
  userId: string,
  user: TossUser
): Promise<TossUser>
```

**Requires:** Biometric authentication

---

## NonceAccountManager API

### Create Account

```typescript
const info = await manager.createNonceAccount(
  user: TossUser,
  nonceAuthorityKeypair: Keypair,
  owner: PublicKey,
  options?: CreateNonceAccountOptions
): Promise<NonceAccountInfo>
```

### Get Account (Secure)

```typescript
const info = await manager.getNonceAccountSecure(
  userId: string,
  authenticator?: () => Promise<void>
): Promise<NonceAccountInfo | null>
```

### Prepare Offline TX

```typescript
const tx = await manager.prepareOfflineTransaction(
  user: TossUser,
  instructions: TransactionInstruction[],
  nonceAccountInfo: NonceAccountInfo
): Promise<OfflineTransaction>
```

### Renew Account

```typescript
const info = await manager.renewNonceAccount(
  userId: string,
  nonceAccountAddress: PublicKey
): Promise<NonceAccountInfo | null>
```

### Validate Account

```typescript
const isValid = manager.isNonceAccountValid(
  nonceAccountInfo: NonceAccountInfo
): boolean
```

---

## React Hooks API

### useOfflineTransaction

```typescript
const {
  transaction,          // Current offline transaction
  isPreparing,          // Loading state
  isReady,              // Transaction ready to send
  error,                // Error message if any
  createOfflineTransaction,  // Create a transaction
  clearTransaction,     // Clear current transaction
  nonceManager,         // NonceAccountManager instance
} = useOfflineTransaction(user: TossUser, connection: Connection);

// Usage
const tx = await createOfflineTransaction(
  instructions: TransactionInstruction[],
  metadata?: { description?: string; tags?: string[] }
): Promise<OfflineTransaction | null>;
```

### useBLETransactionTransmission

```typescript
const {
  isTransmitting,       // Currently sending
  progress,             // { sentFragments, totalFragments, messageId }
  lastSent,             // { messageId, timestamp }
  error,                // Error message if any
  sendTransactionBLE,   // Send transaction
  receiveTransactionFragment,  // Receive fragment
  getMTUConfig,         // Get BLE config
  setMTUConfig,         // Set custom config
} = useBLETransactionTransmission(platform: 'ios' | 'android');

// Usage
const success = await sendTransactionBLE(
  device: Device,
  transaction: OfflineTransaction | SolanaIntent,
  sendFn: (deviceId, char, data) => Promise<void>,
  noiseEncryptFn?: (data) => Promise<EncryptedMessage>,
  isIntent?: boolean
): Promise<boolean>;
```

### useNonceAccountManagement

```typescript
const {
  hasNonceAccount,      // User has nonce account
  isLoading,            // Operation in progress
  error,                // Error message if any
  createNonceAccount,   // Create account
  renewNonceAccount,    // Refresh from chain
  revokeNonceAccount,   // Disable account
  isNonceAccountValid,  // Check validity
} = useNonceAccountManagement(user: TossUser, connection: Connection);

// Usage
const user = await createNonceAccount(userKeypair): Promise<TossUser | null>;
const info = await renewNonceAccount(): Promise<NonceAccountInfo | null>;
const user = await revokeNonceAccount(): Promise<TossUser | null>;
const valid = isNonceAccountValid(): boolean;
```

---

## BLE Module API

### Send Fragmented Transaction

```typescript
const result = await sendOfflineTransactionFragmented(
  device: Device,
  transaction: OfflineTransaction | SolanaIntent,
  noiseEncryptFn?: (data) => Promise<EncryptedMessage>,
  isIntent?: boolean
): Promise<{
  success: boolean;
  sentFragments: number;
  failedFragments: number[];
  messageId: string;
}>
```

### Receive Fragment

```typescript
const result = await receiveOfflineTransactionFragment(
  fragment: BLEFragment,
  noiseDecryptFn?: (encrypted) => Promise<Uint8Array>
): Promise<{
  complete: boolean;
  transaction?: OfflineTransaction | SolanaIntent;
  progress: { received: number; total: number };
}>
```

### Get/Set MTU Config

```typescript
const config = getBLEMTUConfig(): BLEMTUConfig;
setBLEMTUConfig(config: Partial<BLEMTUConfig>): void;

// BLEMTUConfig structure
{
  maxPayloadSize: number;   // e.g., 512
  chunkSize: number;        // e.g., 480
  maxRetries: number;       // e.g., 3
  timeout: number;          // e.g., 5000
}
```

---

## Intent Functions

### Create Offline Intent

```typescript
const intent = await createOfflineIntent(
  senderUser: TossUser,
  senderKeypair: Keypair,
  recipientUser: TossUser,
  amount: number,
  nonceAccountInfo: NonceAccountInfo,
  connection: Connection,
  options?: CreateIntentOptions
): Promise<SolanaIntent>
```

**Options:**

```typescript
{
  privateTransaction?: boolean;      // Encrypt with Arcium
  mxeProgramId?: PublicKey;          // Arcium program ID
  provider?: any;                    // Anchor provider
  expiresIn?: number;                // Expiry in seconds
  fromUser?: TossUserContext;        // Sender context
  toUser?: TossUserContext;          // Recipient context
}
```

---

## Common Patterns

### Complete Offline Payment Flow

```typescript
// 1. Setup
const { createOfflineTransaction } = useOfflineTransaction(user, connection);
const { sendTransactionBLE } = useBLETransactionTransmission('ios');

// 2. Create
const tx = await createOfflineTransaction([
  SystemProgram.transfer({
    fromPubkey: user.wallet.publicKey,
    toPubkey: recipient,
    lamports: amount,
  }),
]);

// 3. Send
const success = await sendTransactionBLE(bleDevice, tx, async (data) => ({
  version: 1,
  ciphertext: await noiseEncrypt(data),
  nonce: getNonce(),
  tag: getTag(),
}));

if (!success) {
  // Handle failed fragments
  console.error('Send failed');
}
```

### Manage Nonce Account Lifecycle

```typescript
const nonce = useNonceAccountManagement(user, connection);

// Check validity
if (!nonce.isNonceAccountValid()) {
  const renewed = await nonce.renewNonceAccount();
  if (!renewed) {
    // Recreate if needed
    const updated = await nonce.createNonceAccount(keypair);
  }
}
```

### Handle Biometric-Protected Access

```typescript
try {
  const tx = await createOfflineTransaction(instructions);
  // Biometric is handled automatically inside
  if (tx) {
    // Success
  }
} catch (error) {
  if (error.message.includes('Biometric')) {
    // User cancelled biometric
  }
}
```

---

## Error Messages

| Error                                       | Cause                   | Solution                                                 |
| ------------------------------------------- | ----------------------- | -------------------------------------------------------- |
| "User does not have nonce account"          | No nonce account        | Create one with `AuthService.createSecureNonceAccount()` |
| "Biometric verification failed"             | User cancelled/failed   | Retry or ask user to unlock wallet                       |
| "Nonce account is no longer valid"          | Account expired         | Renew with `renewNonceAccount()`                         |
| "Failed to send N fragment(s)"              | BLE transmission failed | Retry, check signal strength                             |
| "Biometric auth required but not available" | No biometric on device  | Can't use nonce accounts                                 |
| "Nonce account not found"                   | Account not in storage  | Check user ID, recreate if needed                        |

---

## Exports to Add to index.tsx

```typescript
// Types
export type {
  NonceAccountInfo,
  OfflineTransaction,
} from './types/nonceAccount';

// New functions
export { createOfflineIntent } from './intent';

// Managers
export { NonceAccountManager } from './client/NonceAccountManager';
export { BLETransactionHandler } from './client/BLETransactionHandler';

// Hooks
export {
  useOfflineTransaction,
  useBLETransactionTransmission,
  useNonceAccountManagement,
} from './hooks/useOfflineBLETransactions';

// BLE functions
export {
  sendOfflineTransactionFragmented,
  receiveOfflineTransactionFragment,
  getBLEMTUConfig,
  setBLEMTUConfig,
} from './ble';
```

---

## Platform Notes

### iOS

- Uses Secure Enclave for key storage
- BLE MTU typically 512 bytes
- Chunk size: 480 bytes recommended

### Android

- Uses Keymaster for key storage
- BLE MTU typically 512 bytes
- Chunk size: 480 bytes recommended
- Note: BLE advertising requires react-native-ble-advertise

---

## Performance Tips

1. **Cache nonce accounts** - Hook handles this automatically
2. **Batch transactions** - Send multiple fragments without reconnecting
3. **Customize MTU** - Adjust for your network conditions
4. **Cleanup cache** - Manager auto-cleans every 5 minutes
5. **Biometric optimization** - Keep auth duration reasonable

---

## Troubleshooting

### Fragment Reassembly Fails

- Check CRC32 values
- Verify fragment ordering
- Ensure all fragments received
- Check for corruption in transmission

### Biometric Not Working

- Verify device has biometric
- Check permissions
- Ensure user is enrolled
- Test with built-in biometric apps

### Nonce Account Invalid

- Check account expiry date
- Verify account on blockchain
- Try renewing account
- Recreate if necessary

---

For complete documentation, see [OFFLINE_TRANSACTIONS_GUIDE.md](./OFFLINE_TRANSACTIONS_GUIDE.md)
