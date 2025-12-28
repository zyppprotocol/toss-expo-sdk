import { Device } from 'react-native-ble-plx';
import type { SolanaIntent } from '../intent';
import type { OfflineTransaction } from '../types/nonceAccount';

/**
 * BLE MTU Configuration for different device types
 */
export interface BLEMTUConfig {
  maxPayloadSize: number; // Actual data size (MTU - overhead)
  chunkSize: number; // Size of each fragment
  maxRetries: number; // Max retries per chunk
  timeout: number; // Timeout in ms
}

/**
 * Default MTU configurations
 */
const DEFAULT_MTU_CONFIGS: Record<string, BLEMTUConfig> = {
  android: {
    maxPayloadSize: 512, // Typical Android BLE MTU
    chunkSize: 480, // Conservative chunk size
    maxRetries: 3,
    timeout: 5000,
  },
  ios: {
    maxPayloadSize: 512, // iOS BLE MTU
    chunkSize: 480,
    maxRetries: 3,
    timeout: 5000,
  },
};

/**
 * Represents a fragmented message with header information
 */
export interface BLEFragment {
  messageId: string; // Unique identifier for the message
  sequenceNumber: number; // Fragment index
  totalFragments: number; // Total number of fragments
  checksumValue: number; // CRC32 checksum of fragment
  payload: Uint8Array; // Actual data
}

/**
 * Represents a Noise-encrypted BLE message
 */
export interface EncryptedBLEMessage {
  version: number; // Protocol version
  ciphertext: Uint8Array; // Encrypted payload
  nonce: Uint8Array; // Encryption nonce
  tag: Uint8Array; // Authentication tag
}

/**
 * BLETransactionHandler
 * Manages secure, fragmented BLE transmission of offline transactions
 * with Noise Protocol encryption
 */
export class BLETransactionHandler {
  private mtuConfig!: BLEMTUConfig;
  private fragmentCache: Map<string, BLEFragment[]> = new Map();
  private messageIdMap: Map<string, OfflineTransaction | SolanaIntent> =
    new Map();

  constructor(platform: 'android' | 'ios' = 'android') {
    this.mtuConfig =
      DEFAULT_MTU_CONFIGS[platform] || DEFAULT_MTU_CONFIGS.android!;
  }

  /**
   * Fragment a large transaction/intent into BLE-safe chunks
   * Respects MTU limitations and adds framing information
   */
  fragmentTransaction(
    transaction: OfflineTransaction | SolanaIntent,
    isIntent: boolean = false
  ): BLEFragment[] {
    const payload = Buffer.from(JSON.stringify(transaction), 'utf-8');
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalFragments = Math.ceil(payload.length / this.mtuConfig.chunkSize);
    const fragments: BLEFragment[] = [];

    for (let i = 0; i < totalFragments; i++) {
      const start = i * this.mtuConfig.chunkSize;
      const end = Math.min(start + this.mtuConfig.chunkSize, payload.length);
      const chunk = payload.slice(start, end);

      const fragment: BLEFragment = {
        messageId,
        sequenceNumber: i,
        totalFragments,
        checksumValue: this.calculateCRC32(chunk),
        payload: chunk,
      };

      fragments.push(fragment);
    }

    // Store fragments for reassembly on receiver end
    this.fragmentCache.set(messageId, fragments);
    this.messageIdMap.set(
      messageId,
      isIntent
        ? (transaction as SolanaIntent)
        : (transaction as OfflineTransaction)
    );

    return fragments;
  }

  /**
   * Prepare encrypted BLE message for transmission
   * Uses Noise Protocol for end-to-end encryption
   */
  async prepareEncryptedMessage(
    fragment: BLEFragment,
    noiseEncryptFn: (data: Uint8Array) => Promise<EncryptedBLEMessage>
  ): Promise<EncryptedBLEMessage> {
    // Serialize fragment
    const fragmentData = this.serializeFragment(fragment);

    // Encrypt using Noise Protocol
    const encrypted = await noiseEncryptFn(fragmentData);

    return encrypted;
  }

  /**
   * Send fragmented transaction over BLE with encryption
   * Handles retries and verification
   */
  async sendFragmentedTransactionBLE(
    device: Device,
    transaction: OfflineTransaction | SolanaIntent,
    sendFn: (
      deviceId: string,
      characteristicUUID: string,
      data: Buffer
    ) => Promise<void>,
    noiseEncryptFn?: (data: Uint8Array) => Promise<EncryptedBLEMessage>,
    isIntent: boolean = false
  ): Promise<{
    success: boolean;
    sentFragments: number;
    failedFragments: number[];
    messageId: string;
  }> {
    const fragments = this.fragmentTransaction(transaction, isIntent);
    const messageId = fragments[0]?.messageId;
    const failedFragments: number[] = [];

    if (!messageId) {
      throw new Error('Failed to generate message ID for transaction');
    }

    const CHARACTERISTIC_UUID = '0000ff02-0000-1000-8000-00805f9b34fb'; // Intent characteristic

    for (const fragment of fragments) {
      let retries = 0;
      let sent = false;

      while (retries < this.mtuConfig.maxRetries && !sent) {
        try {
          let messageData: Buffer;

          if (noiseEncryptFn) {
            // Encrypt fragment using Noise Protocol
            const encrypted = await this.prepareEncryptedMessage(
              fragment,
              noiseEncryptFn
            );
            messageData = Buffer.from(JSON.stringify(encrypted), 'utf-8');
          } else {
            // Send unencrypted (not recommended)
            messageData = Buffer.from(JSON.stringify(fragment), 'utf-8');
          }

          // Send via BLE
          await sendFn(device.id, CHARACTERISTIC_UUID, messageData);

          sent = true;
        } catch (error) {
          retries++;
          console.warn(
            `Failed to send fragment ${fragment.sequenceNumber}, retry ${retries}:`,
            error
          );

          if (retries >= this.mtuConfig.maxRetries) {
            failedFragments.push(fragment.sequenceNumber);
          } else {
            // Exponential backoff
            await this.delay(Math.pow(2, retries) * 100);
          }
        }
      }
    }

    return {
      success: failedFragments.length === 0,
      sentFragments: fragments.length - failedFragments.length,
      failedFragments,
      messageId,
    };
  }

  /**
   * Receive and reassemble fragmented messages
   */
  async receiveFragmentedMessage(
    fragment: BLEFragment,
    _noiseDecryptFn?: (encrypted: EncryptedBLEMessage) => Promise<Uint8Array>
  ): Promise<{
    complete: boolean;
    transaction?: OfflineTransaction | SolanaIntent;
    progress: {
      received: number;
      total: number;
    };
  }> {
    const messageId = fragment.messageId;

    // Initialize or retrieve fragment cache
    if (!this.fragmentCache.has(messageId)) {
      this.fragmentCache.set(messageId, []);
    }

    const cachedFragments = this.fragmentCache.get(messageId)!;
    cachedFragments[fragment.sequenceNumber] = fragment;

    const progress = {
      received: cachedFragments.filter((f) => f !== undefined).length,
      total: fragment.totalFragments,
    };

    // Check if all fragments received
    if (progress.received < fragment.totalFragments) {
      return {
        complete: false,
        progress,
      };
    }

    // Reassemble message
    const reassembled = this.reassembleMessage(cachedFragments);

    if (!reassembled) {
      return {
        complete: false,
        progress,
      };
    }

    try {
      // Parse transaction
      const transactionData = JSON.parse(reassembled);
      const transaction: OfflineTransaction | SolanaIntent = transactionData;

      // Cleanup cache
      this.fragmentCache.delete(messageId);
      this.messageIdMap.delete(messageId);

      return {
        complete: true,
        transaction,
        progress,
      };
    } catch (error) {
      console.error('Failed to parse reassembled message:', error);
      return {
        complete: false,
        progress,
      };
    }
  }

  /**
   * Reassemble fragments into original message
   */
  private reassembleMessage(fragments: BLEFragment[]): string | null {
    try {
      // Sort by sequence number
      const sorted = fragments.sort(
        (a, b) => a.sequenceNumber - b.sequenceNumber
      );

      // Verify all fragments present and checksums
      for (const fragment of sorted) {
        const calculatedChecksum = this.calculateCRC32(fragment.payload);
        if (calculatedChecksum !== fragment.checksumValue) {
          console.warn(
            `Checksum mismatch for fragment ${fragment.sequenceNumber}`
          );
          return null;
        }
      }

      // Concatenate payloads
      const combined = Buffer.concat(sorted.map((f) => Buffer.from(f.payload)));
      return combined.toString('utf-8');
    } catch (error) {
      console.error('Failed to reassemble message:', error);
      return null;
    }
  }

  /**
   * Serialize BLE fragment for transmission
   */
  private serializeFragment(fragment: BLEFragment): Uint8Array {
    const data = {
      messageId: fragment.messageId,
      sequenceNumber: fragment.sequenceNumber,
      totalFragments: fragment.totalFragments,
      checksumValue: fragment.checksumValue,
      payload: Array.from(fragment.payload),
    };

    return new Uint8Array(Buffer.from(JSON.stringify(data), 'utf-8'));
  }

  /**
   * Calculate CRC32 checksum for fragment verification
   */
  private calculateCRC32(data: Uint8Array | Buffer): number {
    let crc = 0xffffffff;

    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      if (byte !== undefined) {
        crc = crc ^ byte;
        for (let j = 0; j < 8; j++) {
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
      }
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  /**
   * Delay utility for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get MTU configuration
   */
  getMTUConfig(): BLEMTUConfig {
    return this.mtuConfig;
  }

  /**
   * Set custom MTU configuration
   */
  setMTUConfig(config: Partial<BLEMTUConfig>): void {
    this.mtuConfig = {
      ...this.mtuConfig,
      ...config,
    };
  }
}
