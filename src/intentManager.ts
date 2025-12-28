import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import type { SolanaIntent, IntentStatus } from './intent';

/**
 * Verifies the signature of a Solana intent
 * @param intent The intent to verify
 * @returns boolean indicating if the signature is valid
 */
export function verifyIntentSignature(intent: SolanaIntent): boolean {
  try {
    // Check if serialized transaction exists
    if (!intent.serialized) {
      return false;
    }

    // Reconstruct the transaction to verify signatures
    const tx = Transaction.from(Buffer.from(bs58.decode(intent.serialized)));

    // Verify all signatures in the transaction
    return tx.verifySignatures();
  } catch (error) {
    console.error('Error verifying intent signature:', error);
    return false;
  }
}

/**
 * Checks if an intent has expired
 * @param intent The intent to check
 * @returns boolean indicating if the intent has expired
 */
export function isIntentExpired(intent: SolanaIntent): boolean {
  return Date.now() / 1000 > intent.expiry;
}

/**
 * Updates the status of an intent
 * @param intent The intent to update
 * @param status The new status
 * @param error Optional error message if status is 'failed'
 * @returns A new intent with updated status
 */
export function updateIntentStatus(
  intent: SolanaIntent,
  status: IntentStatus,
  error?: string
): SolanaIntent {
  return {
    ...intent,
    status,
    updatedAt: Math.floor(Date.now() / 1000),
    ...(error && { error }),
  };
}

/**
 * Validates an intent against current blockchain state
 * Note: This is a placeholder - actual implementation would check against a Solana node
 * @param intent The intent to validate
 * @param currentBlockhash Current network blockhash
 * @returns Validation result with success status and optional error message
 */
export async function validateIntent(
  intent: SolanaIntent,
  currentBlockhash: string
): Promise<{ valid: boolean; error?: string }> {
  // Check if intent has expired
  if (isIntentExpired(intent)) {
    return {
      valid: false,
      error: 'Intent has expired',
    };
  }

  // Verify signatures
  if (!verifyIntentSignature(intent)) {
    return {
      valid: false,
      error: 'Invalid transaction signature',
    };
  }

  // Check if blockhash is still valid
  // In a real implementation, we'd check against the Solana cluster
  // This is a simplified check
  if (intent.blockhash !== currentBlockhash) {
    return {
      valid: false,
      error: 'Stale blockhash',
    };
  }

  // Additional validation logic would go here
  // - Check account balances
  // - Verify program-specific logic
  // - Check for double-spend attempts

  return { valid: true };
}

/**
 * Processes a batch of intents for synchronization
 * @param intents Array of intents to process
 * @param connection Connection to Solana network
 * @returns Processed intents with updated statuses
 */
export async function processIntentsForSync(
  intents: SolanaIntent[],
  connection: any // Should be Connection from @solana/web3.js in real implementation
): Promise<SolanaIntent[]> {
  const currentBlockhash = (await connection.getRecentBlockhash()).blockhash;

  return Promise.all(
    intents.map(async (intent) => {
      // Skip already processed intents
      if (intent.status !== 'pending') return intent;

      const validation = await validateIntent(intent, currentBlockhash);

      if (!validation.valid) {
        return updateIntentStatus(intent, 'failed', validation.error);
      }

      try {
        // In a real implementation, we would submit the transaction here
        // const signature = await connection.sendRawTransaction(
        //   Buffer.from(bs58.decode(intent.serialized))
        // );
        // await connection.confirmTransaction(signature);

        return updateIntentStatus(intent, 'settled');
      } catch (error) {
        return updateIntentStatus(
          intent,
          'failed',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    })
  );
}

/**
 * Filters out expired intents and updates their status
 * @param intents Array of intents to check
 * @returns Tuple of [validIntents, expiredIntents]
 */
export function filterExpiredIntents(
  intents: SolanaIntent[]
): [SolanaIntent[], SolanaIntent[]] {
  const valid: SolanaIntent[] = [];
  const expired: SolanaIntent[] = [];

  for (const intent of intents) {
    if (isIntentExpired(intent)) {
      expired.push(updateIntentStatus(intent, 'expired'));
    } else {
      valid.push(intent);
    }
  }

  return [valid, expired];
}
