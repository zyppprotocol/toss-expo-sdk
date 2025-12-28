import { PublicKey } from '@solana/web3.js';

/**
 * Represents a TOSS wallet user in the ecosystem
 * Enhanced with secure nonce account support for offline transactions
 */
export type TossUser = {
  // Core Identity
  userId: string; // TOSS internal ID (e.g., 'toss_123')
  username: string; // @handle format (e.g., '@alice')
  displayName?: string; // Optional display name

  // TOSS Wallet (Primary wallet)
  wallet: {
    publicKey: PublicKey; // Main wallet address
    isVerified: boolean; // KYC/verification status
    createdAt: string; // ISO timestamp
  };

  // Nonce Account (For offline transactions with replay protection)
  nonceAccount?: {
    address: PublicKey; // Public key of the nonce account
    authorizedSigner: PublicKey; // Public key authorized to use this nonce
    isBiometricProtected: boolean; // Requires biometric authentication
    expiresAt?: number; // Unix timestamp of expiry
    status: 'active' | 'expired' | 'revoked'; // Account status
  };

  // Device & Session
  device: {
    id: string; // Unique device ID
    name?: string; // User-defined device name
    lastActive: string; // ISO timestamp
    client: 'mobile' | 'web' | 'desktop';
  };

  // Security & Biometrics
  security: {
    biometricEnabled: boolean; // Biometric authentication enabled
    biometricSalt?: string; // Salt for biometric derivation
    nonceAccountRequiresBiometric: boolean; // Nonce operations require biometric
    lastBiometricVerification?: number; // Unix timestamp
  };

  // Status
  status: 'active' | 'inactive' | 'restricted';
  lastSeen: string; // ISO timestamp

  // TOSS-specific Features
  tossFeatures: {
    canSend: boolean;
    canReceive: boolean;
    isPrivateTxEnabled: boolean;
    maxTransactionAmount: number; // In lamports
    offlineTransactionsEnabled?: boolean; // Can create offline transactions
    nonceAccountEnabled?: boolean; // Has durable nonce account
  };

  // Timestamps
  createdAt: string;
  updatedAt: string;
};

/**
 * Minimal user info for transaction context
 */
export type TossUserContext = Pick<
  TossUser,
  'userId' | 'username' | 'wallet' | 'status'
> & {
  deviceId: string;
  sessionId: string;
};

// Example usage
export const exampleTossUser: TossUser = {
  userId: 'toss_abc123',
  username: '@alice',
  displayName: 'Alice',
  wallet: {
    publicKey: new PublicKey('11111111111111111111111111111111'), // Example key
    isVerified: true,
    createdAt: '2023-01-01T00:00:00Z',
  },
  nonceAccount: {
    address: new PublicKey('22222222222222222222222222222222'),
    authorizedSigner: new PublicKey('33333333333333333333333333333333'),
    isBiometricProtected: true,
    status: 'active',
  },
  device: {
    id: 'dev_xyz789',
    name: 'Alice iPhone',
    lastActive: new Date().toISOString(),
    client: 'mobile',
  },
  security: {
    biometricEnabled: true,
    nonceAccountRequiresBiometric: true,
    lastBiometricVerification: Math.floor(Date.now() / 1000),
  },
  status: 'active',
  lastSeen: new Date().toISOString(),
  tossFeatures: {
    canSend: true,
    canReceive: true,
    isPrivateTxEnabled: true,
    maxTransactionAmount: 1000000000, // 1 SOL in lamports
    offlineTransactionsEnabled: true,
    nonceAccountEnabled: true,
  },
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: new Date().toISOString(),
};
