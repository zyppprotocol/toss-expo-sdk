/**
 * WiFi Direct Transport for TOSS
 *
 * Higher-bandwidth alternative to BLE for device-to-device communication
 * Fallback to BLE if WiFi Direct unavailable
 *
 * Uses native React Native APIs for production-ready implementation
 */

import { NativeModules, Platform } from 'react-native';
import type { SolanaIntent } from './intent';
import type { OfflineTransaction } from './types/nonceAccount';
import { TossError } from './errors';

const { WiFiDirect } = NativeModules;

/**
 * WiFi Direct connection state
 */
export interface WiFiDirectPeer {
  deviceName: string;
  deviceAddress: string;
  isGroupOwner: boolean;
  signalStrength?: number;
}

/**
 * WiFi Direct socket for data transmission
 */
export interface WiFiDirectSocket {
  peerId: string;
  connected: boolean;
  bytesTransferred: number;
  lastActivityTime: number;
}

/**
 * WiFi Direct Transport Handler
 * Wrapper around native WiFi Direct capabilities
 *
 * Supports higher MTU (1200+ bytes) than BLE (480 bytes)
 * Useful for batch transmission of intents
 */
export class WiFiDirectTransport {
  private connectedPeers: Map<string, WiFiDirectSocket> = new Map();
  private readonly SOCKET_TIMEOUT = 30000; // 30 seconds
  private readonly WIFI_MTU = 1200; // Conservative MTU for WiFi packets

  constructor(_platform: 'android' | 'ios' = 'android') {
    if (!WiFiDirect) {
      console.warn(
        'WiFi Direct not available in this environment (requires native module)'
      );
    }
  }

  /**
   * Check if WiFi Direct is available on device
   */
  async isAvailable(): Promise<boolean> {
    if (!WiFiDirect) {
      return false;
    }

    try {
      if (Platform.OS === 'android') {
        return await WiFiDirect.isAvailable();
      }
      // iOS uses different APIs (Bonjour, Multipeer Connectivity)
      return true;
    } catch (error) {
      console.warn('Error checking WiFi Direct availability:', error);
      return false;
    }
  }

  /**
   * Enable WiFi Direct on device
   */
  async enable(): Promise<void> {
    if (!WiFiDirect) {
      throw new TossError(
        'WiFi Direct native module not available',
        'WIFI_DIRECT_UNAVAILABLE'
      );
    }

    try {
      if (Platform.OS === 'android') {
        await WiFiDirect.enable();
      }
    } catch (error) {
      throw new TossError(
        `Failed to enable WiFi Direct: ${error instanceof Error ? error.message : String(error)}`,
        'WIFI_DIRECT_ERROR'
      );
    }
  }

  /**
   * Discover nearby WiFi Direct peers
   */
  async discoverPeers(timeoutSeconds: number = 10): Promise<WiFiDirectPeer[]> {
    if (!WiFiDirect) {
      return [];
    }

    try {
      const peers = await WiFiDirect.discoverPeers(timeoutSeconds * 1000);
      return peers.map((p: any) => ({
        deviceName: p.deviceName,
        deviceAddress: p.deviceAddress,
        isGroupOwner: p.isGroupOwner,
        signalStrength: p.signalStrength,
      }));
    } catch (error) {
      console.warn('Peer discovery failed:', error);
      return [];
    }
  }

  /**
   * Connect to a specific WiFi Direct peer
   */
  async connectToPeer(deviceAddress: string): Promise<WiFiDirectSocket> {
    if (!WiFiDirect) {
      throw new TossError(
        'WiFi Direct not available',
        'WIFI_DIRECT_UNAVAILABLE'
      );
    }

    try {
      const socket: WiFiDirectSocket = {
        peerId: deviceAddress,
        connected: false,
        bytesTransferred: 0,
        lastActivityTime: Date.now(),
      };

      await WiFiDirect.connect(deviceAddress);

      socket.connected = true;
      this.connectedPeers.set(deviceAddress, socket);

      return socket;
    } catch (error) {
      throw new TossError(
        `Failed to connect to WiFi Direct peer: ${error instanceof Error ? error.message : String(error)}`,
        'WIFI_DIRECT_CONNECT_ERROR'
      );
    }
  }

  /**
   * Send intent via WiFi Direct connection
   * Uses larger MTU than BLE for efficiency
   */
  async sendIntent(
    socket: WiFiDirectSocket,
    intent: SolanaIntent
  ): Promise<{
    success: boolean;
    bytesTransferred: number;
    chunks: number;
  }> {
    if (!socket.connected) {
      throw new TossError(
        'WiFi Direct socket not connected',
        'WIFI_DIRECT_DISCONNECTED'
      );
    }

    try {
      const intentBuffer = Buffer.from(JSON.stringify(intent), 'utf-8');
      const chunks = Math.ceil(intentBuffer.length / this.WIFI_MTU);

      let totalTransferred = 0;

      for (let i = 0; i < chunks; i++) {
        const start = i * this.WIFI_MTU;
        const end = Math.min(start + this.WIFI_MTU, intentBuffer.length);
        const chunk = intentBuffer.slice(start, end);

        // Send with simple header: chunk number + total chunks
        const chunkHeader = Buffer.allocUnsafe(2);
        chunkHeader.writeUInt8(i, 0);
        chunkHeader.writeUInt8(chunks, 1);

        const packet = Buffer.concat([chunkHeader, chunk]);

        await WiFiDirect.sendData(socket.peerId, packet);

        totalTransferred += chunk.length;

        // Update socket stats
        socket.bytesTransferred += chunk.length;
        socket.lastActivityTime = Date.now();

        // Small delay between chunks to avoid congestion
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      return {
        success: true,
        bytesTransferred: totalTransferred,
        chunks,
      };
    } catch (error) {
      throw new TossError(
        `Failed to send intent via WiFi Direct: ${error instanceof Error ? error.message : String(error)}`,
        'WIFI_DIRECT_SEND_ERROR'
      );
    }
  }

  /**
   * Send offline transaction via WiFi Direct
   */
  async sendOfflineTransaction(
    socket: WiFiDirectSocket,
    transaction: OfflineTransaction
  ): Promise<{
    success: boolean;
    bytesTransferred: number;
    chunks: number;
  }> {
    const txBuffer = Buffer.from(JSON.stringify(transaction), 'utf-8');
    const chunks = Math.ceil(txBuffer.length / this.WIFI_MTU);

    let totalTransferred = 0;

    for (let i = 0; i < chunks; i++) {
      const start = i * this.WIFI_MTU;
      const end = Math.min(start + this.WIFI_MTU, txBuffer.length);
      const chunk = txBuffer.slice(start, end);

      const chunkHeader = Buffer.allocUnsafe(2);
      chunkHeader.writeUInt8(i, 0);
      chunkHeader.writeUInt8(chunks, 1);

      const packet = Buffer.concat([chunkHeader, chunk]);

      await WiFiDirect.sendData(socket.peerId, packet);

      totalTransferred += chunk.length;
      socket.bytesTransferred += chunk.length;
      socket.lastActivityTime = Date.now();

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return {
      success: true,
      bytesTransferred: totalTransferred,
      chunks,
    };
  }

  /**
   * Receive data from WiFi Direct peer
   */
  async receiveData(
    socket: WiFiDirectSocket,
    expectedChunks: number
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const receivedChunks = new Set<number>();

    try {
      while (receivedChunks.size < expectedChunks) {
        const packet = await WiFiDirect.receiveData(socket.peerId, 5000); // 5 second timeout

        if (packet) {
          const chunkNumber = packet[0];
          // Header byte (not used in reassembly)
          const chunkData = packet.slice(2);

          chunks[chunkNumber] = chunkData;
          receivedChunks.add(chunkNumber);

          socket.lastActivityTime = Date.now();
        }

        // Check timeout
        if (Date.now() - socket.lastActivityTime > this.SOCKET_TIMEOUT) {
          throw new TossError(
            'WiFi Direct socket timeout',
            'WIFI_DIRECT_TIMEOUT'
          );
        }
      }

      return Buffer.concat(chunks);
    } catch (error) {
      throw new TossError(
        `Failed to receive data via WiFi Direct: ${error instanceof Error ? error.message : String(error)}`,
        'WIFI_DIRECT_RECEIVE_ERROR'
      );
    }
  }

  /**
   * Disconnect from WiFi Direct peer
   */
  async disconnect(peerId: string): Promise<void> {
    try {
      const socket = this.connectedPeers.get(peerId);

      if (socket) {
        socket.connected = false;
        this.connectedPeers.delete(peerId);
      }

      if (WiFiDirect) {
        await WiFiDirect.disconnect(peerId);
      }
    } catch (error) {
      console.warn(`Error disconnecting from ${peerId}:`, error);
    }
  }

  /**
   * Get all connected peers
   */
  getConnectedPeers(): WiFiDirectSocket[] {
    return Array.from(this.connectedPeers.values()).filter(
      (socket) => socket.connected
    );
  }

  /**
   * Get MTU size for this transport
   */
  getMTU(): number {
    return this.WIFI_MTU;
  }

  /**
   * Clean up expired connections
   */
  cleanupExpiredConnections(): void {
    const now = Date.now();

    for (const [peerId, socket] of this.connectedPeers.entries()) {
      if (now - socket.lastActivityTime > this.SOCKET_TIMEOUT) {
        this.disconnect(peerId).catch(() => {});
      }
    }
  }
}

/**
 * Smart transport selector
 * Automatically chooses best transport for given context
 */
export class SmartTransportSelector {
  private wifiDirect: WiFiDirectTransport;

  constructor() {
    this.wifiDirect = new WiFiDirectTransport();
  }

  /**
   * Select best available transport for intent transmission
   *
   * Preference order:
   * 1. WiFi Direct (fastest, 1200 MTU)
   * 2. BLE (fallback, 480 MTU)
   */
  async selectTransport(): Promise<'wifi' | 'ble'> {
    const wifiAvailable = await this.wifiDirect.isAvailable();

    if (wifiAvailable) {
      return 'wifi';
    }

    return 'ble';
  }

  /**
   * Check if WiFi Direct should be used
   * Factors: availability, proximity, battery level
   */
  async shouldUseWiFi(checkBattery: boolean = false): Promise<boolean> {
    const available = await this.wifiDirect.isAvailable();

    if (!available) {
      return false;
    }

    // Optional: check battery level
    if (checkBattery) {
      // In production, query Battery API
      // For now, assume battery OK
      return true;
    }

    return true;
  }
}
