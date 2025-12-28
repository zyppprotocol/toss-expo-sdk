/**
 * Represents a durable nonce account for offline transaction support
 * Enables secure offline transaction creation with replay protection
 */
export interface NonceAccountInfo {
  // Account Identity
  address: string; // Public key of the nonce account
  owner: string; // Public key of owner/authority
  authorizedSigner: string; // Public key authorized to use this nonce

  // Nonce State
  currentNonce: number; // Current nonce value
  lastUsedNonce: number; // Last consumed nonce
  blockhash: string; // Associated blockhash

  // Security
  isBiometricProtected: boolean; // Requires biometric to use
  createdAt: number; // Unix timestamp
  lastModified: number; // Unix timestamp

  // Storage
  isStoredSecurely: boolean; // In secure enclave
  encryptedData?: string; // Optional encrypted backup
  minRentLamports?: number; // Minimum rent exemption amount
  status?: 'active' | 'expired' | 'revoked'; // Account lifecycle status
}

/**
 * Options for creating a durable nonce account
 */
export interface CreateNonceAccountOptions {
  // Biometric & Security
  requireBiometric?: boolean; // Default: true (mandatory)
  securityLevel?: 'standard' | 'high' | 'maximum'; // Default: 'standard'

  // Nonce Config
  minNonceCount?: number; // Minimum nonces to maintain (default: 1)
  maxNonceCount?: number; // Maximum nonces to cache (default: 100)

  // Storage
  persistToSecureStorage?: boolean; // Default: true
  allowCloudBackup?: boolean; // Default: false

  // Lifecycle
  autoRenew?: boolean; // Auto-renew when close to expiry (default: true)
  expiryDays?: number; // Account expiry in days (default: 365)
}

/**
 * Nonce account cache entry for efficient offline usage
 */
export interface NonceAccountCacheEntry {
  accountInfo: NonceAccountInfo;
  nonces: number[];
  expiresAt: number;
}

/**
 * Represents a transaction prepared for offline use with nonce account
 */
export interface OfflineTransaction {
  id: string;
  nonceAccount: string;
  nonce: number;
  transaction: string; // Base64 or serialized transaction
  signature?: string;
  status: 'prepared' | 'signed' | 'submitted' | 'confirmed' | 'failed';
  createdAt: number;
  expiresAt: number;
  metadata?: {
    description?: string;
    tags?: string[];
    [key: string]: any;
  };
}
