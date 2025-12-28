// Core types and intents
export {
  createIntent,
  createUserIntent,
  createSignedIntent,
  createOfflineIntent,
  type SolanaIntent,
  type IntentStatus,
} from './intent';

// Nonce Account Management (for offline transactions)
export { NonceAccountManager } from './client/NonceAccountManager';
export type {
  NonceAccountInfo,
  NonceAccountCacheEntry,
  CreateNonceAccountOptions,
  OfflineTransaction,
} from './types/nonceAccount';

// BLE Transaction Handling (fragmentation & Noise encryption)
export { BLETransactionHandler } from './client/BLETransactionHandler';
export type {
  BLEFragment,
  EncryptedBLEMessage,
  BLEMTUConfig,
} from './client/BLETransactionHandler';

// Custom Hooks for Offline BLE Transactions
export {
  useOfflineTransaction,
  useBLETransactionTransmission,
  useNonceAccountManagement,
} from './hooks/useOfflineBLETransactions';
export type {
  BLETransmissionState,
  OfflineTransactionState,
} from './hooks/useOfflineBLETransactions';

// Intent management
export {
  verifyIntentSignature,
  isIntentExpired,
  updateIntentStatus,
  validateIntent,
  processIntentsForSync,
  filterExpiredIntents,
} from './intentManager';

// Storage
export {
  storePendingIntent,
  getPendingIntents,
  clearPendingIntents,
} from './storage';

// Transport methods (enhanced with fragmentation)
export {
  startTossScan,
  requestBLEPermissions,
  sendOfflineTransactionFragmented,
  receiveOfflineTransactionFragment,
  getBLEMTUConfig,
  setBLEMTUConfig,
} from './ble';
export { initNFC, readNFCUser, writeUserToNFC, writeIntentToNFC } from './nfc';
export { QRScanner } from './qr';

// Client
export { TossClient, type TossConfig } from './client/TossClient';
export type { TossUser } from './types/tossUser';
export { WalletProvider, useWallet } from './contexts/WalletContext';

// Authentication Service (enhanced with nonce accounts)
export { AuthService } from './services/authService';
// Sync and settlement
export { syncToChain, checkSyncStatus, type SyncResult } from './sync';

// Reconciliation and conflict detection
export {
  reconcilePendingIntents,
  settleIntent,
  validateIntentOnchain,
  buildTransactionFromIntent,
  submitTransactionToChain,
  detectConflicts,
  getReconciliationState,
  type SettlementResult,
  type ReconciliationState,
} from './reconciliation';

// Device discovery and intent exchange
export {
  DeviceDiscoveryService,
  IntentExchangeProtocol,
  IntentRoutingService,
  MultiDeviceConflictResolver,
  deviceDiscovery,
  intentExchange,
  intentRouting,
  type PeerDevice,
  type IntentExchangeRequest,
  type IntentExchangeResponse,
} from './discovery';

// Compression utilities
export {
  compressMetadata,
  decompressMetadata,
  compressIntentMetadata,
  decompressIntentMetadata,
  estimateCompressionSavings,
} from './utils/compression';

// WiFi Direct transport
export {
  WiFiDirectTransport,
  SmartTransportSelector,
} from './wifi';
