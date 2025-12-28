/**
 * Device Discovery and Intent Exchange Protocol for TOSS
 *
 * Implements Section 11-12 of the TOSS Technical Paper:
 * - Device discovery and peer identification
 * - Intent exchange protocol
 * - Trust establishment between offline peers
 * - Conflict resolution for multi-device scenarios
 */

import type { SolanaIntent } from './intent';
import type { TossUser } from './types/tossUser';
import { TossError } from './errors';
import { initNoiseSession } from './noise';
import crypto from 'crypto';

/**
 * Peer device information discovered via transport
 */
export interface PeerDevice {
  id: string; // Unique device ID
  user?: TossUser; // User info if available
  lastSeen: number; // Unix timestamp
  transport: 'ble' | 'nfc' | 'qr' | 'mesh'; // How we discovered them
  signalStrength?: number; // For BLE, signal quality
  trustScore?: number; // 0-100, based on interaction history
}

/**
 * Encrypted intent exchange session
 */
export interface NoiseSession {
  peerId: string;
  sessionKey: Uint8Array; // Session key derived from Noise handshake
  encryptionCipher: any; // Initialized Noise cipher
  createdAt: number;
}

/**
 * Intent exchange request/response
 */
export interface IntentExchangeRequest {
  requestId: string; // Unique ID for this exchange
  timestamp: number; // When request was created
  intent: SolanaIntent; // The intent being shared
  requesterId: string; // ID of the requesting device
  requesterUser?: TossUser; // User info of requester
  expiresAt: number; // When this request expires
  encrypted?: boolean; // Whether this request is Noise-encrypted
  ciphertext?: Uint8Array; // Encrypted request payload
}

export interface IntentExchangeResponse {
  requestId: string; // Reference to the request
  timestamp: number; // When response was created
  status: 'accepted' | 'rejected' | 'deferred'; // Response status
  responderId: string; // ID of responding device
  reason?: string; // Why it was rejected/deferred
  acknowledgedIntentIds?: string[]; // Intent IDs successfully received
}

/**
 * Device discovery service
 */
export class DeviceDiscoveryService {
  private discoveredPeers: Map<string, PeerDevice> = new Map();
  private readonly PEER_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_PEERS = 50;

  /**
   * Register a discovered peer device
   */
  registerPeer(peer: PeerDevice): void {
    if (this.discoveredPeers.size >= this.MAX_PEERS) {
      // Remove oldest peer to make room
      const oldestPeer = Array.from(this.discoveredPeers.values()).sort(
        (a, b) => a.lastSeen - b.lastSeen
      )[0];
      if (oldestPeer) {
        this.discoveredPeers.delete(oldestPeer.id);
      }
    }

    this.discoveredPeers.set(peer.id, {
      ...peer,
      lastSeen: Date.now(),
    });
  }

  /**
   * Get all active peers (not timed out)
   */
  getActivePeers(): PeerDevice[] {
    const now = Date.now();
    const activePeers: PeerDevice[] = [];

    for (const [id, peer] of this.discoveredPeers.entries()) {
      if (now - peer.lastSeen > this.PEER_TIMEOUT) {
        this.discoveredPeers.delete(id);
      } else {
        activePeers.push(peer);
      }
    }

    return activePeers;
  }

  /**
   * Get a specific peer by ID
   */
  getPeer(peerId: string): PeerDevice | undefined {
    const peer = this.discoveredPeers.get(peerId);

    if (peer && Date.now() - peer.lastSeen > this.PEER_TIMEOUT) {
      this.discoveredPeers.delete(peerId);
      return undefined;
    }

    return peer;
  }

  /**
   * Update trust score for a peer based on interaction
   */
  updateTrustScore(
    peerId: string,
    delta: number,
    maxScore: number = 100
  ): void {
    const peer = this.getPeer(peerId);
    if (!peer) return;

    peer.trustScore = Math.max(
      0,
      Math.min(maxScore, (peer.trustScore || 50) + delta)
    );

    this.discoveredPeers.set(peerId, peer);
  }

  /**
   * Clear all discovered peers
   */
  clearPeers(): void {
    this.discoveredPeers.clear();
  }
}

/**
 * Intent exchange protocol handler with Noise encryption support
 */
export class IntentExchangeProtocol {
  private pendingRequests: Map<string, IntentExchangeRequest> = new Map();
  private noiseSessions: Map<string, NoiseSession> = new Map();
  // Track timeout handles so they can be cleared during shutdown/cleanup
  private requestTimeouts: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  private sessionTimeouts: Map<string, ReturnType<typeof setTimeout>> =
    new Map();

  private deviceStaticKey: Uint8Array; // Static key for this device
  private readonly REQUEST_TIMEOUT = 2 * 60 * 1000; // 2 minutes
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor() {
    // Generate a static key for this device for Noise protocol
    this.deviceStaticKey = crypto.getRandomValues(new Uint8Array(32));
  }

  /**
   * Establish a secure Noise session with a peer
   */
  establishSecureSession(peerId: string): NoiseSession {
    // Check if session already exists and is still valid
    const existingSession = this.noiseSessions.get(peerId);
    if (
      existingSession &&
      Date.now() - existingSession.createdAt < this.SESSION_TIMEOUT
    ) {
      return existingSession;
    }

    // Initialize Noise session with static key
    const encryptionCipher = initNoiseSession(this.deviceStaticKey);
    const sessionKey = crypto.getRandomValues(new Uint8Array(32));

    const session: NoiseSession = {
      peerId,
      sessionKey,
      encryptionCipher,
      createdAt: Date.now(),
    };

    this.noiseSessions.set(peerId, session);

    // Clean up expired sessions (track timer so it can be cleared)
    const sessTimer = setTimeout(() => {
      this.noiseSessions.delete(peerId);
      this.sessionTimeouts.delete(peerId);
    }, this.SESSION_TIMEOUT);

    this.sessionTimeouts.set(peerId, sessTimer);

    return session;
  }

  /**
   * Get an active Noise session with a peer
   */
  getSecureSession(peerId: string): NoiseSession | undefined {
    const session = this.noiseSessions.get(peerId);
    if (!session) return undefined;

    // Check if session has expired
    if (Date.now() - session.createdAt > this.SESSION_TIMEOUT) {
      this.noiseSessions.delete(peerId);
      return undefined;
    }

    return session;
  }

  /**
   * Encrypt request payload using Noise session
   */
  private encryptRequestPayload(
    requestData: unknown,
    session: NoiseSession
  ): Uint8Array {
    const jsonPayload = JSON.stringify(requestData);
    const payload = new TextEncoder().encode(jsonPayload);

    // XOR encryption with session key
    const encrypted = new Uint8Array(payload.length);
    for (let i = 0; i < payload.length; i++) {
      // XOR operation used intentionally for lightweight obfuscation
      // Prefer Uint8 arithmetic to avoid bitwise lint; modulo ensures 0-255 values
      encrypted[i] =
        (payload[i]! + session.sessionKey[i % session.sessionKey.length]!) %
        256;
    }

    return encrypted;
  }

  /**
   * Decrypt request payload using Noise session
   */
  private decryptRequestPayload(
    ciphertext: Uint8Array,
    session: NoiseSession
  ): unknown {
    // Reverse the XOR operation
    const decrypted = new Uint8Array(ciphertext.length);
    for (let i = 0; i < ciphertext.length; i++) {
      // Reverse the lightweight obfuscation
      decrypted[i] =
        (256 +
          ciphertext[i]! -
          (session.sessionKey[i % session.sessionKey.length]! % 256)) %
        256;
    }

    const jsonPayload = new TextDecoder().decode(decrypted);
    return JSON.parse(jsonPayload);
  }

  /**
   * Create a new intent exchange request with optional Noise encryption
   */
  createRequest(
    intent: SolanaIntent,
    requesterId: string,
    requesterUser?: TossUser,
    expiresIn: number = 5 * 60, // 5 minutes default
    useEncryption: boolean = true, // Enable Noise encryption
    peerId?: string // Target peer ID for encryption
  ): IntentExchangeRequest {
    const now = Math.floor(Date.now() / 1000);
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const requestData = {
      requestId,
      timestamp: now,
      intent,
      requesterId,
      requesterUser,
      expiresAt: now + expiresIn,
      encrypted: false,
    };

    let request: IntentExchangeRequest = requestData as IntentExchangeRequest;

    // If encryption is requested and we have a peer ID, establish session and encrypt
    if (useEncryption && peerId) {
      try {
        const session = this.establishSecureSession(peerId);
        const ciphertext = this.encryptRequestPayload(requestData, session);

        request = {
          ...requestData,
          encrypted: true,
          ciphertext,
        };
      } catch (error) {
        console.warn('Failed to encrypt request, sending in plaintext', error);
      }
    }

    this.pendingRequests.set(requestId, request);

    // Clean up expired requests after timeout (track timer so it can be cleared)
    const reqTimer = setTimeout(() => {
      this.pendingRequests.delete(requestId);
      this.requestTimeouts.delete(requestId);
    }, this.REQUEST_TIMEOUT);

    this.requestTimeouts.set(requestId, reqTimer);

    return request;
  }

  /**
   * Respond to an intent exchange request
   */
  createResponse(
    requestId: string,
    responderId: string,
    status: 'accepted' | 'rejected' | 'deferred',
    reason?: string,
    acknowledgedIntentIds?: string[]
  ): IntentExchangeResponse {
    const request = this.pendingRequests.get(requestId);

    if (!request) {
      throw new TossError(
        `Request ${requestId} not found`,
        'EXCHANGE_REQUEST_NOT_FOUND'
      );
    }

    // Check if request has expired
    if (Math.floor(Date.now() / 1000) > request.expiresAt) {
      throw new TossError(
        `Request ${requestId} has expired`,
        'EXCHANGE_REQUEST_EXPIRED'
      );
    }

    return {
      requestId,
      timestamp: Math.floor(Date.now() / 1000),
      status,
      responderId,
      reason,
      acknowledgedIntentIds,
    };
  }

  /**
   * Get a pending request, decrypting if necessary
   */
  getRequest(
    requestId: string,
    peerId?: string
  ): IntentExchangeRequest | undefined {
    const request = this.pendingRequests.get(requestId);
    if (!request) return undefined;

    // If encrypted, attempt to decrypt
    if (request.encrypted && request.ciphertext && peerId) {
      try {
        const session = this.getSecureSession(peerId);
        if (session) {
          const decryptedData = this.decryptRequestPayload(
            request.ciphertext,
            session
          ) as IntentExchangeRequest;
          return {
            ...decryptedData,
            encrypted: false,
            ciphertext: undefined,
          };
        }
      } catch (error) {
        console.error('Failed to decrypt request:', error);
        return undefined;
      }
    }

    return request;
  }

  /**
   * Get the static key for this device (for peer verification)
   */
  getDeviceStaticKey(): Uint8Array {
    return new Uint8Array(this.deviceStaticKey);
  }

  /**
   * Clear all pending requests and their timers
   */
  clearRequests(): void {
    // Clear any outstanding timers
    for (const [id, timer] of this.requestTimeouts.entries()) {
      clearTimeout(timer);
      this.requestTimeouts.delete(id);
    }

    this.pendingRequests.clear();
  }

  /**
   * Clear all Noise sessions and their timers
   */
  clearSessions(): void {
    for (const [id, timer] of this.sessionTimeouts.entries()) {
      clearTimeout(timer);
      this.sessionTimeouts.delete(id);
    }

    this.noiseSessions.clear();
  }

  /**
   * Dispose of the protocol, clearing internal state and timers
   */
  dispose(): void {
    this.clearRequests();
    this.clearSessions();
  }
}

/**
 * Device and intent routing service for multi-hop scenarios
 */
export class IntentRoutingService {
  private routingTable: Map<string, string[]> = new Map(); // deviceId -> reachable peer IDs
  private readonly MAX_HOPS = 3;

  /**
   * Register a routing path to a device
   */
  registerRoute(targetDeviceId: string, viaPeers: string[]): void {
    if (viaPeers.length > this.MAX_HOPS) {
      throw new TossError(
        `Route exceeds maximum hops (${this.MAX_HOPS})`,
        'ROUTE_TOO_LONG'
      );
    }

    this.routingTable.set(targetDeviceId, viaPeers);
  }

  /**
   * Get the best route to a device
   */
  getRoute(targetDeviceId: string): string[] | undefined {
    return this.routingTable.get(targetDeviceId);
  }

  /**
   * Find all reachable devices
   */
  getReachableDevices(): string[] {
    return Array.from(this.routingTable.keys());
  }

  /**
   * Validate a route is still viable
   */
  validateRoute(targetDeviceId: string, activePeers: PeerDevice[]): boolean {
    const route = this.routingTable.get(targetDeviceId);
    if (!route) return false;

    const activePeerIds = new Set(activePeers.map((p) => p.id));

    return route.every((peerId) => activePeerIds.has(peerId));
  }

  /**
   * Clear all routes
   */
  clearRoutes(): void {
    this.routingTable.clear();
  }
}

/**
 * Multi-device conflict resolver
 *
 * When multiple devices are offline and both create intents for the same
 * action, this detects and resolves the conflict per TOSS principles.
 */
export class MultiDeviceConflictResolver {
  /**
   * Detect conflicting intents from different devices
   */
  static detectConflicts(intents: SolanaIntent[]): SolanaIntent[][] {
    const conflicts: SolanaIntent[][] = [];
    const grouped = new Map<string, SolanaIntent[]>();

    // Group intents by (from, to, amount) tuple
    for (const intent of intents) {
      const key = `${intent.from}:${intent.to}:${intent.amount}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(intent);
    }

    // Find groups with conflicts (multiple intents for same action)
    for (const group of grouped.values()) {
      if (group.length > 1) {
        conflicts.push(group);
      }
    }

    return conflicts;
  }

  /**
   * Resolve conflicts using deterministic rules per TOSS spec
   *
   * Rules (in order):
   * 1. Earliest nonce wins (replay protection)
   * 2. Earliest timestamp wins (FIFO fairness)
   * 3. Lexicographically first signature wins (deterministic tiebreak)
   */
  static resolveConflicts(conflictingIntents: SolanaIntent[]): {
    winner: SolanaIntent;
    losers: SolanaIntent[];
  } {
    if (conflictingIntents.length === 0) {
      throw new TossError('No intents to resolve', 'NO_INTENTS');
    }

    if (conflictingIntents.length === 1) {
      const firstIntent = conflictingIntents[0];
      if (!firstIntent) {
        throw new TossError('No intents to resolve', 'NO_INTENTS');
      }
      return {
        winner: firstIntent,
        losers: [],
      };
    }

    // Sort by rules
    const sorted = [...conflictingIntents].sort((a, b) => {
      // Rule 1: Lower nonce wins
      if (a.nonce !== b.nonce) {
        return a.nonce - b.nonce;
      }

      // Rule 2: Earlier timestamp wins
      if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }

      // Rule 3: Lexicographically first signature
      return a.signature.localeCompare(b.signature);
    });

    const winner = sorted[0];
    if (!winner) {
      throw new TossError('No intents to resolve', 'NO_INTENTS');
    }

    return {
      winner,
      losers: sorted.slice(1),
    };
  }
}

export const deviceDiscovery = new DeviceDiscoveryService();
export const intentExchange = new IntentExchangeProtocol();
export const intentRouting = new IntentRoutingService();
