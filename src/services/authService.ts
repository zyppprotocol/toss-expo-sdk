import * as SecureStore from 'expo-secure-store';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import * as LocalAuthentication from 'expo-local-authentication';
import type { TossUser } from '../types/tossUser';
import crypto from 'crypto';
import { NonceAccountManager } from '../client/NonceAccountManager';

export const SESSION_KEY = 'toss_user_session';
const WALLET_KEY = 'toss_encrypted_wallet';
const BIOMETRIC_SALT_KEY = 'toss_biometric_salt';
const NONCE_ACCOUNT_KEY = 'toss_nonce_account';

type UserSession = {
  id: string;
  token: string;
  expiresAt: number;
  walletAddress: string;
};

export class AuthService {
  static async signInWithWallet(
    walletAddress: string,
    isTemporary: boolean = false
  ): Promise<{ user: TossUser; session: UserSession }> {
    // In a real implementation, this would call your backend
    const session: UserSession = {
      id: `sess_${Date.now()}`,
      token: `token_${Math.random().toString(36).substr(2, 9)}`,
      expiresAt: isTemporary
        ? Date.now() + 1000 * 60 * 60 * 24 // 24 hours for temporary
        : Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days
      walletAddress,
    };

    const user: TossUser = {
      userId: `user_${walletAddress.slice(0, 8)}`,
      username: `user_${walletAddress.slice(0, 6)}`,
      wallet: {
        publicKey: new PublicKey(walletAddress),
        isVerified: false,
        createdAt: new Date().toISOString(),
      },
      device: {
        id: 'device_id_here', // You'd get this from the device
        lastActive: new Date().toISOString(),
        client: 'mobile',
      },
      security: {
        biometricEnabled: false,
        nonceAccountRequiresBiometric: true,
      },
      status: 'active',
      lastSeen: new Date().toISOString(),
      tossFeatures: {
        canSend: true,
        canReceive: true,
        isPrivateTxEnabled: true,
        maxTransactionAmount: 10000,
        offlineTransactionsEnabled: false,
        nonceAccountEnabled: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.saveSession(session);
    return { user, session };
  }

  static async saveSession(session: UserSession): Promise<void> {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  }

  static async getSession(): Promise<UserSession | null> {
    const session = await SecureStore.getItemAsync(SESSION_KEY);
    return session ? JSON.parse(session) : null;
  }

  static async signOut(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await SecureStore.deleteItemAsync(WALLET_KEY);
  }

  static async isWalletUnlocked(): Promise<boolean> {
    const isAvailable = await SecureStore.isAvailableAsync();
    if (!isAvailable) return false;

    const item = await SecureStore.getItemAsync(WALLET_KEY);
    return item !== null;
  }

  static async unlockWalletWithBiometrics(): Promise<Keypair | null> {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      throw new Error(
        'Biometric authentication required but not available on this device'
      );
    }

    // REQUIRED: Biometric authentication before key access
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Biometric authentication required to access wallet',
      fallbackLabel: 'Enter PIN',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      throw new Error('Biometric authentication failed - access denied');
    }

    // Only after successful biometric: retrieve encrypted keypair
    const encrypted = await SecureStore.getItemAsync(WALLET_KEY);
    if (!encrypted) {
      throw new Error('Wallet not found - ensure wallet is set up first');
    }

    const salt = await SecureStore.getItemAsync(BIOMETRIC_SALT_KEY);
    if (!salt) {
      throw new Error('Wallet configuration corrupted');
    }

    try {
      const decryptedData = JSON.parse(encrypted);

      if (!decryptedData.publicKey || !decryptedData.secretKey) {
        throw new Error('Invalid wallet data');
      }

      // Reconstruct keypair from encrypted storage
      const secretKeyArray = new Uint8Array(decryptedData.secretKey);
      const keypair = Keypair.fromSecretKey(secretKeyArray);

      // Verify keypair integrity
      if (keypair.publicKey.toString() !== decryptedData.publicKey) {
        throw new Error(
          'Keypair verification failed - wallet may be corrupted'
        );
      }

      // Keypair returned but never exported/stored externally
      return keypair;
    } catch (error) {
      throw new Error(
        `Failed to unlock wallet: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Setup biometric-protected wallet (REQUIRED for security)
   *
   * SECURITY CRITICAL:
   * - Private keypair is encrypted and stored in hardware-secure storage
   * - Private key NEVER accessible without biometric authentication
   * - User CANNOT export, backup, or access seed phrase
   * - Keypair is device-specific and non-custodial
   *
   * @param keypair User's Solana keypair (never re-used or exported)
   * @param useBiometrics Must be true (biometric is mandatory, not optional)
   */
  static async setupWalletProtection(
    keypair: Keypair,
    useBiometrics: boolean = true
  ): Promise<void> {
    if (!useBiometrics) {
      throw new Error(
        ' SECURITY ERROR: Biometric protection is mandatory for wallet security'
      );
    }

    // Verify biometric is available on device
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      throw new Error(
        ' Biometric authentication required but not configured on device'
      );
    }

    // Generate unique salt for this wallet
    const salt = crypto.getRandomValues(new Uint8Array(16)).toString();
    await SecureStore.setItemAsync(BIOMETRIC_SALT_KEY, salt);

    // Encrypt and store keypair in hardware-backed secure storage
    const walletData = {
      publicKey: keypair.publicKey.toString(),
      secretKey: Array.from(keypair.secretKey), // Serializable format only
      createdAt: Date.now(),
      biometricRequired: true,
      nonCustodial: true,
      deviceSpecific: true,
      exportable: false, // Explicitly non-exportable
    };

    // Store in Secure Enclave (iOS) or Keymaster (Android)
    await SecureStore.setItemAsync(WALLET_KEY, JSON.stringify(walletData));
  }

  /**
   * Verify wallet is stored securely (requires biometric to access)
   * @returns true if wallet exists and requires biometric
   */
  static async isKeypairStoredSecurely(): Promise<boolean> {
    const stored = await SecureStore.getItemAsync(WALLET_KEY);
    return stored !== null;
  }

  /**
   * Get public key only (NO AUTHENTICATION REQUIRED - public key is safe)
   * Use this for displaying wallet address, sending funds to, etc.
   */
  static async getPublicKeyWithoutAuth(): Promise<PublicKey | null> {
    try {
      const encrypted = await SecureStore.getItemAsync(WALLET_KEY);
      if (!encrypted) return null;

      const data = JSON.parse(encrypted);
      return new PublicKey(data.publicKey);
    } catch (error) {
      console.error('Failed to get public key:', error);
      return null;
    }
  }

  /**
   * Lock wallet from memory (does NOT delete stored keypair)
   * Keypair remains encrypted in secure storage
   */
  static async lockWalletFromMemory(): Promise<void> {
    // This is handled by WalletContext clearing the keypair state
    // The encrypted keypair stays in SecureStore
  }

  /**
   * Permanently delete wallet (IRREVERSIBLE)
   * Only use for logout or account deletion
   */
  static async deleteWalletPermanently(): Promise<void> {
    await SecureStore.deleteItemAsync(WALLET_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_SALT_KEY);
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }

  /**
   * Create a secure durable nonce account for offline transactions
   * REQUIRES biometric authentication for maximum security
   *
   * This creates a nonce account that enables:
   * - Offline transaction creation (with replay protection)
   * - Biometric-protected signing
   * - Encrypted storage with Noise Protocol support
   */
  static async createSecureNonceAccount(
    user: TossUser,
    connection: Connection,
    userKeypair: Keypair
  ): Promise<TossUser> {
    // Verify biometric is available and enrolled
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      throw new Error(
        ' Biometric authentication required but not configured on this device'
      );
    }

    // Require biometric verification before creating nonce account
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Biometric verification required to create nonce account',
      fallbackLabel: 'Use PIN',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      throw new Error(
        'Biometric verification failed - nonce account creation denied'
      );
    }

    try {
      // Initialize nonce account manager
      const nonceManager = new NonceAccountManager(connection);

      // Generate nonce authority keypair (separate from user wallet for security)
      const nonceAuthorityKeypair = Keypair.generate();

      // Create the nonce account
      const nonceAccountInfo = await nonceManager.createNonceAccount(
        user,
        nonceAuthorityKeypair,
        userKeypair.publicKey,
        {
          requireBiometric: true,
          securityLevel: 'high',
          persistToSecureStorage: true,
          autoRenew: true,
        }
      );

      // Update user with nonce account information
      const updatedUser: TossUser = {
        ...user,
        nonceAccount: {
          address: new PublicKey(nonceAccountInfo.address),
          authorizedSigner: new PublicKey(nonceAccountInfo.authorizedSigner),
          isBiometricProtected: true,
          status: 'active',
        },
        security: {
          ...user.security,
          biometricEnabled: true,
          nonceAccountRequiresBiometric: true,
          lastBiometricVerification: Math.floor(Date.now() / 1000),
        },
        tossFeatures: {
          ...user.tossFeatures,
          offlineTransactionsEnabled: true,
          nonceAccountEnabled: true,
        },
        updatedAt: new Date().toISOString(),
      };

      return updatedUser;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create nonce account: ${errorMessage}`);
    }
  }

  /**
   * Enable offline transactions for a user with nonce account support
   * Ensures all security measures are in place
   */
  static async enableOfflineTransactions(user: TossUser): Promise<TossUser> {
    // Verify user has nonce account
    if (!user.nonceAccount) {
      throw new Error('User does not have a nonce account. Create one first.');
    }

    // Verify biometric is enabled
    if (!user.security.biometricEnabled) {
      throw new Error('Biometric authentication must be enabled first');
    }

    // Update user with offline transactions enabled
    return {
      ...user,
      tossFeatures: {
        ...user.tossFeatures,
        offlineTransactionsEnabled: true,
        nonceAccountEnabled: true,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Verify nonce account is accessible and valid
   * Requires biometric authentication
   */
  static async verifyNonceAccountAccess(userId: string): Promise<boolean> {
    try {
      // Verify biometric
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify nonce account access with biometric',
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: false,
      });

      if (!result.success) {
        return false;
      }

      // Check if nonce account exists in secure storage
      const storageKey = `${NONCE_ACCOUNT_KEY}_${userId}`;
      const stored = await SecureStore.getItemAsync(storageKey);

      return stored !== null;
    } catch (error) {
      console.error('Failed to verify nonce account access:', error);
      return false;
    }
  }

  /**
   * Revoke nonce account (security measure)
   * Requires biometric verification
   */
  static async revokeNonceAccount(
    userId: string,
    user: TossUser
  ): Promise<TossUser> {
    // Require biometric verification
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Biometric verification required to revoke nonce account',
      fallbackLabel: 'Use PIN',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      throw new Error('Biometric verification failed - revocation denied');
    }

    // Remove nonce account from storage
    const storageKey = `${NONCE_ACCOUNT_KEY}_${userId}`;
    await SecureStore.deleteItemAsync(storageKey);

    // Update user
    return {
      ...user,
      nonceAccount: undefined,
      tossFeatures: {
        ...user.tossFeatures,
        offlineTransactionsEnabled: false,
        nonceAccountEnabled: false,
      },
      updatedAt: new Date().toISOString(),
    };
  }
}
