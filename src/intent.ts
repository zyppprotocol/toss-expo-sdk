import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import type { AccountInfo } from '@solana/web3.js';
import bs58 from 'bs58';
import { v4 as uuidv4 } from 'uuid';
import { sign } from 'tweetnacl';
import nacl from 'tweetnacl';
import type { TossUser, TossUserContext } from './types/tossUser';
import type { OfflineTransaction } from './types/nonceAccount';
import {
  encryptForArciumInternal,
  type ArciumEncryptedOutput,
} from './internal/arciumHelper';
// Nonce management now handled internally

/**
 * Status of an intent in its lifecycle
 */
export type IntentStatus = 'pending' | 'settled' | 'failed' | 'expired';

/**
 * Core type for an offline intent following TOSS specification
 * Enhanced with durable nonce account support
 */
export interface SolanaIntent {
  // Core fields
  id: string; // Unique identifier for the intent
  from: string; // Sender's public key
  to: string; // Recipient's public key
  // Optional TOSS user contexts (preferred for TOSS-to-TOSS communication)
  fromUser?: TossUserContext; // Minimal sender user context
  toUser?: TossUserContext; // Minimal recipient user context
  amount: number; // Amount in lamports
  nonce: number; // For replay protection
  expiry: number; // Unix timestamp in seconds
  signature: string; // Signature of the intent
  status: IntentStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;

  // Transaction metadata
  blockhash?: string; // Optional: For transaction construction
  feePayer?: string; // Optional: Public key of fee payer
  signatures?: string[]; // Optional: Transaction signatures
  serialized?: string; // Optional: Serialized transaction
  nonceAccount?: string; // Optional: Public key of the nonce account
  nonceAuth?: string; // Optional: Public key authorized to use the nonce
  nonceAccountAddress?: string; // Durable nonce account address (from nonce account)
  nonceAccountAuth?: string; // Authority for durable nonce account

  // Offline transaction support
  offlineTransaction?: OfflineTransaction; // Associated offline transaction
  requiresBiometric?: boolean; // Requires biometric to sign/execute

  // Privacy features
  encrypted?: ArciumEncryptedOutput; // Optional encrypted payload
}

/**
 * Options for creating a new intent
 */
export interface CreateIntentOptions {
  /** Whether to encrypt the transaction details using Arcium */
  privateTransaction?: boolean;
  /** Program ID for Arcium encryption */
  mxeProgramId?: PublicKey;
  /** Provider for blockchain access */
  provider?: any; // AnchorProvider or similar
  /** Expiry time in seconds from now (default: 1 hour) */
  expiresIn?: number;
  /** Custom nonce (auto-generated if not provided) */
  nonce?: number;
  /** Keypair for the nonce account (for durable transactions) */
  nonceAccount?: Keypair;
  /** Public key authorized to use the nonce account */
  nonceAuth?: PublicKey;
  /** Fee payer for the transaction (defaults to sender) */
  feePayer?: PublicKey | string;
  /** Optional minimal user contexts for sender and recipient */
  fromUser?: TossUserContext;
  toUser?: TossUserContext;
}

/**
 * Manages nonce values for transaction replay protection
 */
class NonceManager {
  private nonceStore: Map<string, { nonce: number; lastUsed: number }> =
    new Map();
  private readonly NONCE_EXPIRY = 5 * 60 * 1000; // 5 minutes

  async getNextNonce(
    publicKey: PublicKey,
    connection: Connection
  ): Promise<number> {
    const key = publicKey.toBase58();
    const now = Date.now();

    // Clean up old nonces
    this.cleanupNonces();

    try {
      // Get nonce from chain
      const accountInfo = await connection.getAccountInfo(publicKey);
      const chainNonce = accountInfo
        ? this.extractNonceFromAccountInfo(accountInfo)
        : 0;

      // Get or initialize stored nonce
      const stored = this.nonceStore.get(key) || {
        nonce: chainNonce,
        lastUsed: now,
      };
      const nextNonce = Math.max(stored.nonce + 1, chainNonce + 1);

      // Update store
      this.nonceStore.set(key, { nonce: nextNonce, lastUsed: now });
      return nextNonce;
    } catch (error) {
      console.warn(
        'Failed to get nonce from chain, using in-memory nonce',
        error
      );
      const stored = this.nonceStore.get(key) || { nonce: 0, lastUsed: now };
      const nextNonce = stored.nonce + 1;
      this.nonceStore.set(key, { nonce: nextNonce, lastUsed: now });
      return nextNonce;
    }
  }

  private extractNonceFromAccountInfo(
    accountInfo: AccountInfo<Buffer>
  ): number {
    // For SystemProgram accounts, nonce is typically stored in the first 8 bytes
    const data = accountInfo.data;
    return data?.length >= 8 ? data.readUInt32LE(0) : 0;
  }

  private cleanupNonces() {
    const now = Date.now();
    for (const [key, value] of this.nonceStore.entries()) {
      if (now - value.lastUsed > this.NONCE_EXPIRY) {
        this.nonceStore.delete(key);
      }
    }
  }
}

export const nonceManager = new NonceManager();

/**
 * Creates a signed intent between two TOSS users (User-centric API)
 * Recommended for application developers - validates user wallets
 *
 * GAP #8 FIX: Requires biometric authentication for sensitive transactions
 */
export async function createUserIntent(
  senderUser: TossUser,
  senderKeypair: Keypair,
  recipientUser: TossUser,
  amount: number,
  connection: Connection,
  options: CreateIntentOptions = {}
): Promise<SolanaIntent> {
  // GAP #8 FIX: Require biometric verification if enabled
  if (senderUser.security?.biometricEnabled) {
    try {
      const LocalAuthentication = await import('expo-local-authentication');
      const compatible = await LocalAuthentication.default.hasHardwareAsync();
      if (compatible) {
        const authenticated =
          await LocalAuthentication.default.authenticateAsync({
            disableDeviceFallback: false,
          });

        if (!authenticated.success) {
          throw new Error('Biometric authentication failed');
        }
      }
    } catch (error) {
      console.warn(
        'Biometric verification not available, proceeding without',
        error
      );
    }
  }

  // Verify sender's keypair matches their wallet
  if (
    senderKeypair.publicKey.toBase58() !==
    senderUser.wallet.publicKey.toBase58()
  ) {
    throw new Error('Sender keypair does not match user wallet');
  }

  // Verify both users can transact
  if (!senderUser.tossFeatures.canSend) {
    throw new Error('Sender account is not enabled for sending');
  }
  if (!recipientUser.tossFeatures.canReceive) {
    throw new Error('Recipient account is not enabled for receiving');
  }

  // Verify transaction amount is within limits
  if (amount > senderUser.tossFeatures.maxTransactionAmount) {
    throw new Error(
      `Transaction amount exceeds limit of ${senderUser.tossFeatures.maxTransactionAmount} lamports`
    );
  }

  // Prepare minimal user contexts for inclusion in the intent
  const senderCtx: TossUserContext = {
    userId: senderUser.userId,
    username: senderUser.username,
    wallet: {
      publicKey: senderUser.wallet.publicKey,
      isVerified: senderUser.wallet.isVerified,
      createdAt: senderUser.wallet.createdAt,
    },
    status: senderUser.status,
    deviceId: senderUser.device.id,
    sessionId: uuidv4(),
  };

  const recipientCtx: TossUserContext = {
    userId: recipientUser.userId,
    username: recipientUser.username,
    wallet: {
      publicKey: recipientUser.wallet.publicKey,
      isVerified: recipientUser.wallet.isVerified,
      createdAt: recipientUser.wallet.createdAt,
    },
    status: recipientUser.status,
    deviceId: recipientUser.device.id,
    sessionId: uuidv4(),
  };

  // Create intent using keypair and recipient's public key, and include user contexts
  const intent = await createSignedIntent(
    senderKeypair,
    recipientUser.wallet.publicKey,
    amount,
    connection,
    { ...options, fromUser: senderCtx, toUser: recipientCtx }
  );

  // Ensure user contexts are present on return (for backward compatibility)
  intent.fromUser = senderCtx;
  intent.toUser = recipientCtx;

  return intent;
}

/**
 * Creates a signed intent that can be verified offline
 */
export async function createSignedIntent(
  sender: Keypair,
  recipient: PublicKey,
  amount: number,
  connection: Connection,
  options: CreateIntentOptions = {}
): Promise<SolanaIntent> {
  const now = Math.floor(Date.now() / 1000);
  const defaultExpiry = 24 * 60 * 60; // 24 hours default

  // Get latest blockhash and nonce
  const [{ blockhash }, nonce] = await Promise.all([
    connection.getLatestBlockhash(),
    options.nonce !== undefined
      ? Promise.resolve(options.nonce)
      : nonceManager.getNextNonce(sender.publicKey, connection),
  ]);

  // Create base intent
  const baseIntent: Omit<SolanaIntent, 'signature'> = {
    id: uuidv4(),
    from: sender.publicKey.toBase58(),
    to: recipient.toBase58(),
    // Include optional user contexts when provided
    ...(options.fromUser ? { fromUser: options.fromUser } : {}),
    ...(options.toUser ? { toUser: options.toUser } : {}),
    amount,
    nonce,
    expiry: now + (options.expiresIn || defaultExpiry),
    blockhash,
    feePayer: options.nonceAuth?.toBase58() || sender.publicKey.toBase58(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...(options.nonceAccount && options.nonceAuth
      ? {
          nonceAccount: options.nonceAccount.publicKey.toBase58(),
          nonceAuth: options.nonceAuth.toBase58(),
        }
      : {}),
  };

  // Sign the intent
  const signature = sign(
    Buffer.from(JSON.stringify(baseIntent)),
    sender.secretKey
  );

  return {
    ...baseIntent,
    signature: bs58.encode(signature),
  };
}

/**
 * Verifies the signature, nonce, and expiry of an intent
 */
export async function verifyIntent(
  intent: SolanaIntent,
  connection?: Connection
): Promise<boolean> {
  try {
    // Basic validation
    if (!intent.signature || !intent.from || !intent.to) {
      return false;
    }

    // Check if intent is expired
    if (isIntentExpired(intent)) {
      return false;
    }

    // Verify signature
    const signature = bs58.decode(intent.signature);
    const message = Buffer.from(
      JSON.stringify({ ...intent, signature: undefined })
    );
    const publicKey = new PublicKey(intent.from).toBytes();

    try {
      // Use nacl.sign.detached.verify for detached signature verification
      // Requires: message, detached signature, public key
      const publicKeyUint8 = new Uint8Array(publicKey);
      const signatureUint8 = new Uint8Array(signature);

      const verified = nacl.sign.detached.verify(
        Buffer.from(message),
        signatureUint8,
        publicKeyUint8
      );

      if (!verified) {
        return false;
      }
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }

    // Verify nonce if connection is provided
    if (connection) {
      try {
        const accountInfo = await connection.getAccountInfo(
          new PublicKey(intent.from)
        );
        if (accountInfo) {
          const currentNonce =
            accountInfo.data?.length >= 8
              ? accountInfo.data.readUInt32LE(0)
              : 0;
          if (intent.nonce <= currentNonce) {
            return false; // Nonce too low or reused
          }
        }
      } catch (error) {
        console.warn('Failed to verify nonce:', error);
        // Continue without nonce verification if we can't check the chain
      }
    }

    return true;
  } catch (error) {
    console.error('Intent verification failed:', error);
    return false;
  }
}

/**
 * Creates an offline Solana intent following TOSS specification.
 * If privateTransaction is true, encrypts internal data with Arcium.
 */
export async function createIntent(
  sender: Keypair,
  recipient: PublicKey,
  amount: number,
  connection: Connection,
  options: CreateIntentOptions = {}
): Promise<SolanaIntent> {
  // First create and sign the intent
  const intent = await createSignedIntent(
    sender,
    recipient,
    amount,
    connection,
    options
  );

  // If private transaction, encrypt the intent data
  if (options.privateTransaction) {
    if (!options.mxeProgramId) {
      throw new Error('MXE Program ID is required for private transactions');
    }
    if (!options.provider) {
      throw new Error('Provider is required for private transactions');
    }

    const plaintextValues: bigint[] = [
      BigInt(amount),
      // Include additional fields for privacy as needed
    ];

    intent.encrypted = await encryptForArciumInternal(
      options.mxeProgramId,
      plaintextValues,
      options.provider
    );
  }

  return intent;
}

/**
 * Checks if an intent has expired
 */
export function isIntentExpired(intent: SolanaIntent): boolean {
  return intent.expiry <= Math.floor(Date.now() / 1000);
}

/**
 * Updates the status of an intent
 */
export function updateIntentStatus(
  intent: SolanaIntent,
  status: IntentStatus,
  error?: string
): SolanaIntent {
  return {
    ...intent,
    status,
    error,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}
/**
 * Creates an offline intent with durable nonce account support
 * Enables replay-protected offline transactions using nonce accounts
 * Requires biometric authentication for enhanced security
 */
export async function createOfflineIntent(
  senderUser: TossUser,
  senderKeypair: Keypair,
  recipientUser: TossUser,
  amount: number,
  nonceAccountInfo: any, // NonceAccountInfo from NonceAccountManager
  connection: Connection,
  options: CreateIntentOptions = {}
): Promise<SolanaIntent> {
  // Verify sender has nonce account enabled
  if (
    !senderUser.nonceAccount ||
    !senderUser.tossFeatures.offlineTransactionsEnabled
  ) {
    throw new Error('Offline transactions not enabled for this user');
  }

  // Verify sender's keypair matches their wallet
  if (
    senderKeypair.publicKey.toBase58() !==
    senderUser.wallet.publicKey.toBase58()
  ) {
    throw new Error('Sender keypair does not match user wallet');
  }

  // Verify both users can transact
  if (!senderUser.tossFeatures.canSend) {
    throw new Error('Sender account is not enabled for sending');
  }
  if (!recipientUser.tossFeatures.canReceive) {
    throw new Error('Recipient account is not enabled for receiving');
  }

  // Verify transaction amount is within limits
  if (amount > senderUser.tossFeatures.maxTransactionAmount) {
    throw new Error(
      `Transaction amount exceeds limit of ${senderUser.tossFeatures.maxTransactionAmount} lamports`
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const defaultExpiry = 24 * 60 * 60; // 24 hours default

  // Get latest blockhash for nonce account
  const { blockhash } = await connection.getLatestBlockhash();

  // Prepare user contexts
  const senderCtx: TossUserContext = {
    userId: senderUser.userId,
    username: senderUser.username,
    wallet: {
      publicKey: senderUser.wallet.publicKey,
      isVerified: senderUser.wallet.isVerified,
      createdAt: senderUser.wallet.createdAt,
    },
    status: senderUser.status,
    deviceId: senderUser.device.id,
    sessionId: uuidv4(),
  };

  const recipientCtx: TossUserContext = {
    userId: recipientUser.userId,
    username: recipientUser.username,
    wallet: {
      publicKey: recipientUser.wallet.publicKey,
      isVerified: recipientUser.wallet.isVerified,
      createdAt: recipientUser.wallet.createdAt,
    },
    status: recipientUser.status,
    deviceId: recipientUser.device.id,
    sessionId: uuidv4(),
  };

  // Create base intent with nonce account support
  const baseIntent: Omit<SolanaIntent, 'signature'> = {
    id: uuidv4(),
    from: senderKeypair.publicKey.toBase58(),
    to: recipientUser.wallet.publicKey.toBase58(),
    fromUser: senderCtx,
    toUser: recipientCtx,
    amount,
    nonce: nonceAccountInfo.currentNonce,
    expiry: now + (options.expiresIn || defaultExpiry),
    blockhash,
    feePayer: senderKeypair.publicKey.toBase58(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    // Nonce account support
    nonceAccountAddress: nonceAccountInfo.address,
    nonceAccountAuth: nonceAccountInfo.authorizedSigner,
    requiresBiometric: senderUser.security.nonceAccountRequiresBiometric,
    // Backward compatibility
    nonceAccount: nonceAccountInfo.address,
    nonceAuth: nonceAccountInfo.authorizedSigner,
  };

  // Sign the intent
  const signature = sign(
    Buffer.from(JSON.stringify(baseIntent)),
    senderKeypair.secretKey
  );

  const intent: SolanaIntent = {
    ...baseIntent,
    signature: bs58.encode(signature),
  };

  // If private transaction, encrypt the intent data
  if (options.privateTransaction) {
    if (!options.mxeProgramId) {
      throw new Error('MXE Program ID is required for private transactions');
    }
    if (!options.provider) {
      throw new Error('Provider is required for private transactions');
    }

    const plaintextValues: bigint[] = [BigInt(amount)];

    intent.encrypted = await encryptForArciumInternal(
      options.mxeProgramId,
      plaintextValues,
      options.provider
    );
  }

  return intent;
}
