import * as SecureStore from 'expo-secure-store';
import { StorageError } from '../errors';
import type { SolanaIntent } from '../intent';

const STORAGE_PREFIX = 'toss_intent_';

// Helper function to get all keys
async function getAllKeys(): Promise<string[]> {
  // expo-secure-store doesn't have a direct way to get all keys,
  // so we'll need to track them manually
  const keys = await SecureStore.getItemAsync(`${STORAGE_PREFIX}_keys`);
  return keys ? JSON.parse(keys) : [];
}

// Helper function to save all keys
async function saveKeys(keys: string[]): Promise<void> {
  await SecureStore.setItemAsync(
    `${STORAGE_PREFIX}_keys`,
    JSON.stringify(keys)
  );
}

export async function secureStoreIntent(intent: SolanaIntent): Promise<void> {
  try {
    const key = `${STORAGE_PREFIX}${intent.id}`;
    await SecureStore.setItemAsync(key, JSON.stringify(intent));

    // Update the keys list
    const keys = await getAllKeys();
    if (!keys.includes(key)) {
      keys.push(key);
      await saveKeys(keys);
    }
  } catch (error) {
    throw new StorageError('Failed to store intent securely', {
      cause: error,
      intentId: intent.id,
    });
  }
}

export async function getSecureIntent(
  intentId: string
): Promise<SolanaIntent | null> {
  try {
    const value = await SecureStore.getItemAsync(
      `${STORAGE_PREFIX}${intentId}`
    );
    return value ? JSON.parse(value) : null;
  } catch (error) {
    throw new StorageError('Failed to retrieve intent', {
      cause: error,
      intentId,
    });
  }
}

export async function getAllSecureIntents(): Promise<SolanaIntent[]> {
  try {
    const keys = await getAllKeys();
    const intents = await Promise.all(
      keys.map(async (key: string) => {
        const value = await SecureStore.getItemAsync(key);
        return value ? JSON.parse(value) : null;
      })
    );
    return intents.filter(Boolean);
  } catch (error) {
    throw new StorageError('Failed to retrieve all intents', { cause: error });
  }
}

export async function removeSecureIntent(intentId: string): Promise<void> {
  try {
    const key = `${STORAGE_PREFIX}${intentId}`;
    await SecureStore.deleteItemAsync(key);

    // Update the keys list
    const keys = await getAllKeys();
    const updatedKeys = keys.filter((k) => k !== key);
    await saveKeys(updatedKeys);
  } catch (error) {
    throw new StorageError('Failed to remove intent', {
      cause: error,
      intentId,
    });
  }
}

export async function clearAllSecureIntents(): Promise<void> {
  try {
    const keys = await getAllKeys();
    await Promise.all(
      keys.map((key: string) => SecureStore.deleteItemAsync(key))
    );
    await saveKeys([]);
  } catch (error) {
    throw new StorageError('Failed to clear all intents', { cause: error });
  }
}

/**
 * GAP #1: Cleanup expired intents from local storage
 * Per TOSS Paper Section 8: Local state is append-only until settlement confirmation
 */
export async function cleanupExpiredIntents(): Promise<number> {
  try {
    const intents = await getAllSecureIntents();
    const now = Math.floor(Date.now() / 1000);
    let cleanedCount = 0;

    for (const intent of intents) {
      if (intent.expiry < now) {
        await removeSecureIntent(intent.id);
        cleanedCount++;
      }
    }

    return cleanedCount;
  } catch (error) {
    throw new StorageError('Failed to cleanup expired intents', {
      cause: error,
    });
  }
}

/**
 * GAP #2: Store and retrieve reconciliation state
 * Per TOSS Paper Section 9: Track which intents have been synced/failed/conflicted
 */
const RECONCILIATION_STATE_KEY = 'toss_reconciliation_state_';

export interface ReconciliationStateData {
  userId: string;
  lastSyncTime: number;
  lastSyncSlot: number;
  processedIntents: string[]; // Intent IDs successfully settled
  failedIntents: string[]; // Intent IDs that failed/were rejected
  conflictingIntents: string[]; // Intent IDs with detected conflicts
}

export async function saveReconciliationState(
  userId: string,
  state: Partial<ReconciliationStateData>
): Promise<void> {
  try {
    const key = `${RECONCILIATION_STATE_KEY}${userId}`;
    const existing = await SecureStore.getItemAsync(key);
    const currentState: ReconciliationStateData = existing
      ? JSON.parse(existing)
      : {
          userId,
          lastSyncTime: 0,
          lastSyncSlot: 0,
          processedIntents: [],
          failedIntents: [],
          conflictingIntents: [],
        };

    const merged: ReconciliationStateData = {
      ...currentState,
      ...state,
      userId, // Always preserve userId
    };

    await SecureStore.setItemAsync(key, JSON.stringify(merged));
  } catch (error) {
    throw new StorageError('Failed to save reconciliation state', {
      cause: error,
      userId,
    });
  }
}

export async function getReconciliationState(
  userId: string
): Promise<ReconciliationStateData> {
  try {
    const key = `${RECONCILIATION_STATE_KEY}${userId}`;
    const value = await SecureStore.getItemAsync(key);

    if (value) {
      return JSON.parse(value);
    }

    return {
      userId,
      lastSyncTime: 0,
      lastSyncSlot: 0,
      processedIntents: [],
      failedIntents: [],
      conflictingIntents: [],
    };
  } catch (error) {
    throw new StorageError('Failed to retrieve reconciliation state', {
      cause: error,
      userId,
    });
  }
}

export async function updateReconciliationState(
  userId: string,
  intentId: string,
  status: 'processed' | 'failed' | 'conflicted'
): Promise<void> {
  try {
    const current = await getReconciliationState(userId);

    // Remove from all lists first
    current.processedIntents = current.processedIntents.filter(
      (id) => id !== intentId
    );
    current.failedIntents = current.failedIntents.filter(
      (id) => id !== intentId
    );
    current.conflictingIntents = current.conflictingIntents.filter(
      (id) => id !== intentId
    );

    // Add to appropriate list
    if (status === 'processed') {
      current.processedIntents.push(intentId);
    } else if (status === 'failed') {
      current.failedIntents.push(intentId);
    } else if (status === 'conflicted') {
      current.conflictingIntents.push(intentId);
    }

    await saveReconciliationState(userId, current);
  } catch (error) {
    throw new StorageError('Failed to update reconciliation state', {
      cause: error,
      userId,
      intentId,
    });
  }
}
