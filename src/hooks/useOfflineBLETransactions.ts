import { useCallback, useEffect, useRef, useState } from 'react';
import { Device } from 'react-native-ble-plx';
import { Connection } from '@solana/web3.js';
import type { SolanaIntent } from '../intent';
import type {
  OfflineTransaction,
  NonceAccountCacheEntry,
} from '../types/nonceAccount';
import type { TossUser } from '../types/tossUser';
import { BLETransactionHandler } from '../client/BLETransactionHandler';
import { NonceAccountManager } from '../client/NonceAccountManager';
import { AuthService } from '../services/authService';

/**
 * State for BLE transaction transmission
 */
export interface BLETransmissionState {
  isTransmitting: boolean;
  progress: {
    sentFragments: number;
    totalFragments: number;
    messageId?: string;
  };
  error?: string;
  lastSent?: {
    messageId: string;
    timestamp: number;
  };
}

/**
 * State for offline transaction preparation
 */
export interface OfflineTransactionState {
  isPreparing: boolean;
  transaction?: OfflineTransaction;
  error?: string;
  isReady: boolean;
}

/**
 * useOfflineTransaction Hook
 * Manages offline transaction creation with nonce accounts
 * Handles biometric protection and secure storage
 */
export function useOfflineTransaction(user: TossUser, connection: Connection) {
  const [state, setState] = useState<OfflineTransactionState>({
    isPreparing: false,
    isReady: false,
  });
  const nonceManagerRef = useRef<NonceAccountManager | null>(null);

  // Initialize nonce manager
  useEffect(() => {
    nonceManagerRef.current = new NonceAccountManager(connection);

    // Cleanup expired cache periodically
    const interval = setInterval(
      () => {
        nonceManagerRef.current?.cleanupExpiredCache();
      },
      5 * 60 * 1000
    ); // Every 5 minutes

    return () => clearInterval(interval);
  }, [connection]);

  /**
   * Create offline transaction with nonce account
   * Requires biometric verification if enabled
   */
  const createOfflineTransaction = useCallback(
    async (
      instructions: any[], // TransactionInstruction[]
      metadata?: { description?: string; tags?: string[] }
    ): Promise<OfflineTransaction | null> => {
      if (!user.nonceAccount) {
        setState((prev) => ({
          ...prev,
          error: 'User does not have nonce account configured',
        }));
        return null;
      }

      setState((prev) => ({
        ...prev,
        isPreparing: true,
        error: undefined,
      }));

      try {
        // Verify nonce account access (requires biometric if enabled)
        if (user.security.nonceAccountRequiresBiometric) {
          const hasAccess = await AuthService.verifyNonceAccountAccess(
            user.userId
          );
          if (!hasAccess) {
            throw new Error('Biometric verification failed');
          }
        }

        // Get cached nonce account or retrieve from storage
        const nonceManager = nonceManagerRef.current!;
        let nonceAccountData = nonceManager.getCachedNonceAccount(user.userId);

        let nonceAccountInfo: NonceAccountCacheEntry | null = null;
        if (nonceAccountData) {
          nonceAccountInfo = nonceAccountData;
        } else {
          const retrievedInfo = await nonceManager.getNonceAccountSecure(
            user.userId
          );
          if (retrievedInfo) {
            nonceAccountInfo = nonceManager.getCachedNonceAccount(user.userId);
          }
        }

        if (!nonceAccountInfo) {
          throw new Error('Failed to retrieve nonce account information');
        }

        // Validate nonce account
        if (!nonceManager.isNonceAccountValid(nonceAccountInfo.accountInfo)) {
          throw new Error('Nonce account is no longer valid');
        }

        // Prepare offline transaction
        const transaction = await nonceManager.prepareOfflineTransaction(
          user,
          instructions,
          nonceAccountInfo.accountInfo
        );

        transaction.metadata = metadata || {};

        setState((prev) => ({
          ...prev,
          transaction,
          isReady: true,
          isPreparing: false,
        }));

        return transaction;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setState((prev) => ({
          ...prev,
          error: errorMessage,
          isPreparing: false,
          isReady: false,
        }));
        return null;
      }
    },
    [user]
  );

  /**
   * Clear current offline transaction
   */
  const clearTransaction = useCallback(() => {
    setState({
      isPreparing: false,
      isReady: false,
    });
  }, []);

  return {
    ...state,
    createOfflineTransaction,
    clearTransaction,
    nonceManager: nonceManagerRef.current,
  };
}

/**
 * useBLETransactionTransmission Hook
 * Handles secure BLE transmission of fragmented transactions
 * with Noise Protocol encryption
 */
export function useBLETransactionTransmission(
  platform: 'android' | 'ios' = 'android'
) {
  const [state, setState] = useState<BLETransmissionState>({
    isTransmitting: false,
    progress: {
      sentFragments: 0,
      totalFragments: 0,
    },
  });

  const bleHandlerRef = useRef(new BLETransactionHandler(platform));

  /**
   * Send transaction over BLE with fragmentation
   */
  const sendTransactionBLE = useCallback(
    async (
      device: Device,
      transaction: OfflineTransaction | SolanaIntent,
      sendFn: (
        deviceId: string,
        characteristicUUID: string,
        data: Buffer
      ) => Promise<void>,
      noiseEncryptFn?: (data: Uint8Array) => Promise<any>,
      isIntent: boolean = false
    ): Promise<boolean> => {
      setState((prev) => ({
        ...prev,
        isTransmitting: true,
        error: undefined,
      }));

      try {
        const bleHandler = bleHandlerRef.current;
        const result = await bleHandler.sendFragmentedTransactionBLE(
          device,
          transaction,
          sendFn,
          noiseEncryptFn,
          isIntent
        );

        if (!result.success) {
          const failedCount = result.failedFragments.length;
          throw new Error(
            `Failed to send ${failedCount} fragment(s): ${result.failedFragments.join(', ')}`
          );
        }

        setState((prev) => ({
          ...prev,
          isTransmitting: false,
          progress: {
            sentFragments: result.sentFragments,
            totalFragments:
              result.sentFragments + result.failedFragments.length,
            messageId: result.messageId,
          },
          lastSent: {
            messageId: result.messageId,
            timestamp: Date.now(),
          },
        }));

        return true;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setState((prev) => ({
          ...prev,
          isTransmitting: false,
          error: errorMessage,
        }));
        return false;
      }
    },
    []
  );

  /**
   * Receive fragmented transaction
   */
  const receiveTransactionFragment = useCallback(
    async (
      fragment: any, // BLEFragment
      noiseDecryptFn?: (encrypted: any) => Promise<Uint8Array>
    ): Promise<{
      complete: boolean;
      transaction?: OfflineTransaction | SolanaIntent;
      progress: { received: number; total: number };
    }> => {
      try {
        const bleHandler = bleHandlerRef.current;
        const result = await bleHandler.receiveFragmentedMessage(
          fragment,
          noiseDecryptFn
        );

        setState((prev) => ({
          ...prev,
          progress: {
            sentFragments: result.progress.received,
            totalFragments: result.progress.total,
            messageId: fragment.messageId,
          },
        }));

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setState((prev) => ({
          ...prev,
          error: errorMessage,
        }));

        return {
          complete: false,
          progress: { received: 0, total: 0 },
        };
      }
    },
    []
  );

  const getMTUConfig = useCallback(() => {
    return bleHandlerRef.current.getMTUConfig();
  }, []);

  const setMTUConfig = useCallback((config: Partial<any>) => {
    bleHandlerRef.current.setMTUConfig(config);
  }, []);

  return {
    ...state,
    sendTransactionBLE,
    receiveTransactionFragment,
    getMTUConfig,
    setMTUConfig,
  };
}

/**
 * useNonceAccountManagement Hook
 * Manages nonce account lifecycle: creation, renewal, revocation
 */
export function useNonceAccountManagement(
  user: TossUser,
  connection: Connection
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const nonceManagerRef = useRef(new NonceAccountManager(connection));

  /**
   * Create nonce account with biometric protection
   */
  const createNonceAccount = useCallback(
    async (userKeypair: any) => {
      setIsLoading(true);
      setError(undefined);

      try {
        const updatedUser = await AuthService.createSecureNonceAccount(
          user,
          connection,
          userKeypair
        );

        return updatedUser;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [user, connection]
  );

  /**
   * Renew nonce account (refresh from blockchain)
   */
  const renewNonceAccount = useCallback(async () => {
    if (!user.nonceAccount) {
      setError('No nonce account to renew');
      return null;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      const updated = await nonceManagerRef.current.renewNonceAccount(
        user.userId,
        user.nonceAccount.address
      );

      return updated;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user.userId, user.nonceAccount]);

  /**
   * Revoke nonce account
   */
  const revokeNonceAccount = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const updatedUser = await AuthService.revokeNonceAccount(
        user.userId,
        user
      );

      return updatedUser;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const isNonceAccountValid = useCallback(() => {
    if (!user.nonceAccount) {
      return false;
    }

    const cached = nonceManagerRef.current.getCachedNonceAccount(user.userId);
    if (cached) {
      return nonceManagerRef.current.isNonceAccountValid(cached.accountInfo);
    }

    return user.nonceAccount.status === 'active';
  }, [user.userId, user.nonceAccount]);

  return {
    isLoading,
    error,
    createNonceAccount,
    renewNonceAccount,
    revokeNonceAccount,
    isNonceAccountValid,
    hasNonceAccount: !!user.nonceAccount,
  };
}
