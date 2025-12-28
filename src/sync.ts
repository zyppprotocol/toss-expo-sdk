/**
 * Synchronisation with Solana Blockchain
 *
 * Implements Section 9 of the TOSS Technical Paper:
 * Upon regaining connectivity, devices initiate reconciliation with onchain state.
 * All offline artifacts are verified onchain and settled with deterministic outcomes.
 *
 * GAP #2 FIX: Track synchronization state persistently
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  reconcilePendingIntents,
  detectConflicts,
  getReconciliationState,
  type SettlementResult,
  type ReconciliationState,
} from './reconciliation';
import { updateReconciliationState } from './storage/secureStorage';
import { NetworkError } from './errors';

export interface SyncResult {
  // Intents that were successfully settled onchain
  successfulSettlements: SettlementResult[];
  // Intents that were rejected or failed
  failedSettlements: SettlementResult[];
  // Conflicts detected during reconciliation
  detectedConflicts: { intentId: string; conflict: string }[];
  // Overall reconciliation state
  reconciliationState: ReconciliationState;
  // Timestamp of sync
  syncTimestamp: number;
  // Whether sync was successful (all intents processed)
  isComplete: boolean;
}

/**
 * Full sync and reconciliation with the Solana blockchain
 *
 * This is the primary function for TOSS settlement. When a device regains
 * connectivity, it calls this to:
 * 1. Detect any conflicts with onchain state
 * 2. Settle all pending intents
 * 3. Update local state with results
 *
 * GAP #2 FIX: Persist reconciliation state for future queries
 *
 * @param connection Connection to Solana RPC
 * @param userId User ID for state tracking (required for persistence)
 * @param feePayer Optional fee payer keypair public key
 * @returns Detailed sync results including conflicts and settlements
 */
export async function syncToChain(
  connection: Connection,
  userId?: string,
  feePayer?: PublicKey
): Promise<SyncResult> {
  const syncTimestamp = Math.floor(Date.now() / 1000);

  try {
    // Step 1: Detect any conflicts with onchain state
    const detectedConflicts = await detectConflicts(connection);

    // Step 2: Reconcile and settle all pending intents
    const allSettlementResults = await reconcilePendingIntents(
      connection,
      feePayer
    );

    // Step 3: Separate successful and failed settlements
    const successfulSettlements = allSettlementResults.filter(
      (r) => r.status === 'success'
    );
    const failedSettlements = allSettlementResults.filter(
      (r) => r.status !== 'success'
    );

    // Step 4: Get final reconciliation state
    const reconciliationState = await getReconciliationState(connection);

    // GAP #2 FIX: Persist reconciliation state to storage
    if (userId) {
      try {
        // Update individual intent statuses
        for (const settlement of successfulSettlements) {
          await updateReconciliationState(
            userId,
            settlement.intentId,
            'processed'
          );
        }
        for (const settlement of failedSettlements) {
          await updateReconciliationState(
            userId,
            settlement.intentId,
            'failed'
          );
        }
        for (const conflict of detectedConflicts) {
          await updateReconciliationState(
            userId,
            conflict.intentId,
            'conflicted'
          );
        }
      } catch (storageError) {
        console.warn(
          'Failed to update reconciliation state storage:',
          storageError
        );
      }
    }

    const isComplete =
      failedSettlements.length === 0 && detectedConflicts.length === 0;

    return {
      successfulSettlements,
      failedSettlements,
      detectedConflicts,
      reconciliationState,
      syncTimestamp,
      isComplete,
    };
  } catch (error) {
    throw new NetworkError(
      `Sync to chain failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

/**
 * Lightweight sync to check status without settling
 * Useful for monitoring or UI updates without committing to settlements
 */
export async function checkSyncStatus(
  connection: Connection
): Promise<ReconciliationState> {
  return getReconciliationState(connection);
}
