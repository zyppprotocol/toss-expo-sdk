import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type { SolanaIntent, IntentStatus } from '../intent';
import { createIntent } from '../intent';
import {
  secureStoreIntent,
  getSecureIntent,
  getAllSecureIntents,
} from '../storage/secureStorage';
import { processIntentsForSync } from '../intentManager';
import { TossError, NetworkError, StorageError, ERROR_CODES } from '../errors';
import { createNonceAccount, getNonce } from '../utils/nonceUtils';
// Note: TossClient is not tied to a React hook. To use wallet-provided keys in React, pass a Keypair to methods directly.
import { syncToChain, checkSyncStatus, type SyncResult } from '../sync';
import { detectConflicts, getReconciliationState } from '../reconciliation';

export type TossConfig = {
  projectId: string;
  mode?: 'devnet' | 'testnet' | 'mainnet-beta';
  privateTransactions?: boolean;
  provider?: any; // AnchorProvider or similar
  sync?: {
    syncBackupDb?: boolean;
    dbUrl?: string;
  };
  rpcUrl?: string;
  maxRetries?: number;
  retryDelay?: number;
  feePayer?: Keypair; // Optional fee payer
};

const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
};

export class TossClient {
  private connection: Connection;
  private config: Required<Omit<TossConfig, 'rpcUrl' | 'feePayer'>> & {
    rpcUrl: string;
    feePayer?: Keypair;
  };
  private nonceAccount?: Keypair;
  private nonceAuth?: PublicKey;

  static createClient(config: TossConfig): TossClient {
    return new TossClient(config);
  }

  private constructor(config: TossConfig) {
    this.config = {
      projectId: config.projectId,
      mode: config.mode || 'devnet',
      privateTransactions: config.privateTransactions || false,
      provider: config.provider,
      sync: config.sync || { syncBackupDb: false },
      rpcUrl: config.rpcUrl || this.getDefaultRpcUrl(config.mode || 'devnet'),
      maxRetries: config.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries,
      retryDelay: config.retryDelay ?? DEFAULT_RETRY_OPTIONS.retryDelay,
      feePayer: config.feePayer,
    } as const;
    this.connection = new Connection(this.config.rpcUrl, 'confirmed');
  }

  private getDefaultRpcUrl(network: string): string {
    const urls = {
      'devnet': 'https://api.devnet.solana.com',
      'testnet': 'https://api.testnet.solana.com',
      'mainnet-beta': 'https://api.mainnet-beta.solana.com',
    };
    return urls[network as keyof typeof urls] || urls.devnet;
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | null = null;
    const { maxRetries, retryDelay } = this.config;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on validation errors
        if (error instanceof TossError) {
          throw error;
        }

        // Exponential backoff
        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new NetworkError(
      `Failed after ${maxRetries} attempts: ${lastError?.message}`,
      { context, cause: lastError }
    );
  }

  /**
   * Initialize a nonce account for durable transactions
   * @param amount SOL amount to fund the nonce account with (default: 1 SOL)
   * @returns Object containing nonce account and authority public keys
   */
  async initializeNonceAccount(
    amount = 1
  ): Promise<{ nonceAccount: string; nonceAuth: string }> {
    if (!this.config.feePayer) {
      throw new Error(
        'Fee payer keypair is required for nonce account creation'
      );
    }

    const { nonceAccount, nonceAuth } = await createNonceAccount(
      this.connection,
      this.config.feePayer,
      undefined,
      amount * 1e9 // Convert SOL to lamports
    );

    this.nonceAccount = nonceAccount;
    this.nonceAuth = nonceAuth;

    return {
      nonceAccount: nonceAccount.publicKey.toBase58(),
      nonceAuth: nonceAuth.toBase58(),
    };
  }

  /**
   * Get the current nonce value from the nonce account
   * @returns The current nonce value as a base58 string
   */
  async getCurrentNonce(): Promise<string> {
    if (!this.nonceAccount) {
      throw new Error(
        'Nonce account not initialized. Call initializeNonceAccount() first.'
      );
    }
    return getNonce(this.connection, this.nonceAccount.publicKey);
  }

  async createIntent(
    sender: Keypair | 'current',
    recipient: PublicKey | string,
    amount: number,
    feePayer?: PublicKey | string,
    options: {
      expiresIn?: number;
      nonce?: number;
      useDurableNonce?: boolean;
      memo?: string;
    } = {}
  ): Promise<SolanaIntent> {
    return this.withRetry(async () => {
      try {
        if (!this.connection) {
          throw new TossError(
            'Connection not initialized',
            ERROR_CODES.NETWORK_ERROR
          );
        }

        // Handle 'current' sender: explicit wallet integration via React hooks is
        // not available in this non-React class. Require a Keypair to be passed.
        if (sender === 'current') {
          throw new TossError(
            'Using "current" as sender is only supported when the client is used inside a WalletProvider. Please provide a Keypair instead.',
            ERROR_CODES.SIGNATURE_VERIFICATION_FAILED
          );
        }

        const senderKeypair = sender as Keypair;

        if (!senderKeypair) {
          throw new TossError(
            'No sender keypair provided',
            ERROR_CODES.SIGNATURE_VERIFICATION_FAILED
          );
        }

        // Convert string addresses to PublicKey if needed
        const recipientPubkey =
          typeof recipient === 'string' ? new PublicKey(recipient) : recipient;

        const feePayerPubkey = feePayer
          ? typeof feePayer === 'string'
            ? new PublicKey(feePayer)
            : feePayer
          : senderKeypair.publicKey;

        // Set up nonce account and auth if using durable nonce
        if (options.useDurableNonce && this.nonceAccount && this.nonceAuth) {
          // nonce account and auth are passed via options to createIntent
        }

        // Get the latest blockhash (no need to store it as it's handled internally)
        await this.connection.getLatestBlockhash();

        const intent = await createIntent(
          senderKeypair,
          recipientPubkey,
          amount,
          this.connection,
          {
            ...options,
            feePayer: feePayerPubkey,
            nonceAccount: options.useDurableNonce
              ? this.nonceAccount
              : undefined,
            nonceAuth: options.useDurableNonce ? this.nonceAuth : undefined,
          }
        );

        await secureStoreIntent(intent);
        return intent;
      } catch (error) {
        if (error instanceof TossError) throw error;
        throw new TossError(
          'Failed to create intent',
          ERROR_CODES.TRANSACTION_FAILED,
          { cause: error }
        );
      }
    }, 'createIntent');
  }

  async getIntents(): Promise<SolanaIntent[]> {
    return this.withRetry(async () => {
      try {
        return await getAllSecureIntents();
      } catch (error) {
        if (error instanceof TossError) throw error;
        throw new StorageError('Failed to retrieve intents', { cause: error });
      }
    }, 'getIntents');
  }

  async updateIntentStatus(
    intentId: string,
    status: IntentStatus,
    error?: string
  ): Promise<SolanaIntent | null> {
    return this.withRetry(async () => {
      try {
        const intent = await getSecureIntent(intentId);
        if (!intent) return null;

        // Ensure updatedAt is a number (timestamp)
        const updatedAt = Date.now();

        const updatedIntent: SolanaIntent = {
          ...intent,
          status,
          updatedAt,
          ...(error ? { error } : {}),
        };

        await secureStoreIntent(updatedIntent);
        return updatedIntent;
      } catch (err) {
        if (err instanceof TossError) throw err;
        throw new StorageError('Failed to update intent status', {
          cause: err,
          intentId,
          status,
        });
      }
    }, 'updateIntentStatus');
  }

  async sync(): Promise<SolanaIntent[]> {
    return this.withRetry(async () => {
      try {
        const intents = await getAllSecureIntents();

        if (!this.config.sync?.syncBackupDb || !this.config.sync.dbUrl) {
          return intents;
        }

        // Process intents for sync and update their statuses
        const processedIntents = await processIntentsForSync(
          intents,
          this.connection
        );

        // Save updated intents
        await Promise.all(
          processedIntents.map((intent) => secureStoreIntent(intent))
        );

        return processedIntents;
      } catch (error) {
        if (error instanceof TossError) throw error;
        throw new NetworkError('Failed to sync intents', { cause: error });
      }
    }, 'sync');
  }

  /**
   * Full synchronisation with Solana blockchain (TOSS Section 9)
   *
   * Performs complete reconciliation:
   * - Detects conflicts with onchain state
   * - Settles all pending intents
   * - Updates local state deterministically
   *
   * @returns Complete sync results including settlements, conflicts, and final state
   */
  async fullSync(): Promise<SyncResult> {
    return this.withRetry(async () => {
      try {
        return await syncToChain(
          this.connection,
          this.config.feePayer?.publicKey?.toBase58()
        );
      } catch (error) {
        if (error instanceof TossError) throw error;
        throw new NetworkError('Full sync failed', { cause: error });
      }
    }, 'fullSync');
  }

  /**
   * Check synchronisation status without settling
   *
   * Lightweight operation to query current reconciliation state
   * without committing any settlements to the blockchain.
   */
  async checkSyncStatus() {
    return this.withRetry(async () => {
      return await checkSyncStatus(this.connection);
    }, 'checkSyncStatus');
  }

  /**
   * Detect conflicts between local intents and onchain state
   *
   * Useful for monitoring and alerting users to potential issues
   * before attempting settlement.
   */
  async detectIntentConflicts() {
    return this.withRetry(async () => {
      return await detectConflicts(this.connection);
    }, 'detectIntentConflicts');
  }

  /**
   * Get current reconciliation state
   *
   * Returns summary of processed, failed, and conflicting intents
   * for UI updates or logging.
   */
  async getReconciliationStatus() {
    return this.withRetry(async () => {
      return await getReconciliationState(this.connection);
    }, 'getReconciliationStatus');
  }

  /**
   * Create an intent from the current user's wallet
   */
  /**
   * Create an intent using an explicit Keypair for the sender.
   * Use this method from non-React contexts. For React apps, use
   * WalletProvider.createUserIntent helper wrappers that call
   * TossClient.createIntent with the unlocked keypair.
   */
  async createUserIntent(
    senderKeypair: Keypair,
    recipient: PublicKey | string,
    amount: number,
    options: {
      memo?: string;
      useDurableNonce?: boolean;
    } = {}
  ): Promise<SolanaIntent> {
    const recipientPubkey =
      typeof recipient === 'string' ? new PublicKey(recipient) : recipient;

    return this.createIntent(
      senderKeypair,
      recipientPubkey,
      amount,
      senderKeypair.publicKey,
      {
        ...options,
        memo: options.memo || `TOSS transfer to ${recipientPubkey.toBase58()}`,
      }
    );
  }

  /**
   * The following helper methods require a WalletProvider (React) context.
   * TossClient is framework-agnostic; if you need these features from a
   * React app, use the WalletProvider utilities instead.
   */
  getCurrentUserAddress(): string | null {
    throw new Error(
      'getCurrentUserAddress is only available when using WalletProvider'
    );
  }

  isWalletUnlocked(): boolean {
    throw new Error(
      'isWalletUnlocked is only available when using WalletProvider'
    );
  }

  async lockWallet(): Promise<void> {
    throw new Error('lockWallet is only available when using WalletProvider');
  }

  async signOut(): Promise<void> {
    throw new Error('signOut is only available when using WalletProvider');
  }
}
