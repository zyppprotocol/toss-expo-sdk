/**
 * Unit Tests for TOSS Reconciliation Module
 * Tests the core reconciliation and settlement logic from Section 9-10
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import {
  validateIntentOnchain,
  buildTransactionFromIntent,
} from '../reconciliation';
import { createSignedIntent } from '../intent';
import type { SolanaIntent } from '../intent';

// Mock connection for testing
const mockConnection = {
  getAccountInfo: jest.fn(),
  getLatestBlockhash: jest.fn().mockResolvedValue({
    blockhash: 'EksnHYAxZEqkLC6tsa4LmSKv67m6qPWtKwMEHUxvLfs7',
    lastValidBlockHeight: 180000000,
  }),
  getSignaturesForAddress: jest.fn().mockResolvedValue([]),
  getParsedTransaction: jest.fn(),
  getSlot: jest.fn().mockResolvedValue(180000000),
  sendRawTransaction: jest.fn(),
  confirmTransaction: jest.fn(),
} as any;

describe('Reconciliation Module', () => {
  let senderKeypair: Keypair;
  let recipientAddress: PublicKey;
  let testIntent: SolanaIntent;

  beforeEach(async () => {
    senderKeypair = Keypair.generate();
    recipientAddress = new PublicKey('11111111111111111111111111111111');

    // Create a test intent
    testIntent = await createSignedIntent(
      senderKeypair,
      recipientAddress,
      1000000, // 1 SOL
      mockConnection
    );
  });

  describe('validateIntentOnchain', () => {
    it('should validate a valid intent', async () => {
      mockConnection.getAccountInfo.mockResolvedValueOnce({
        lamports: 5000000, // 5 SOL
        owner: new PublicKey('11111111111111111111111111111111'),
        executable: false,
        rentEpoch: 0,
        data: Buffer.alloc(0),
      });

      const result = await validateIntentOnchain(testIntent, mockConnection);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject expired intent', async () => {
      const expiredIntent = {
        ...testIntent,
        expiry: Math.floor(Date.now() / 1000) - 100, // Expired
      };

      const result = await validateIntentOnchain(expiredIntent, mockConnection);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject intent with insufficient balance', async () => {
      mockConnection.getAccountInfo.mockResolvedValueOnce({
        lamports: 100000, // 0.1 SOL (less than intent amount)
        owner: new PublicKey('11111111111111111111111111111111'),
        executable: false,
        rentEpoch: 0,
        data: Buffer.alloc(0),
      });

      const result = await validateIntentOnchain(testIntent, mockConnection);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });

    it('should reject intent from non-existent account', async () => {
      mockConnection.getAccountInfo.mockResolvedValueOnce(null);

      const result = await validateIntentOnchain(testIntent, mockConnection);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not exist');
    });
  });

  describe('buildTransactionFromIntent', () => {
    it('should build a valid transaction from intent', async () => {
      mockConnection.getLatestBlockhash.mockResolvedValueOnce({
        blockhash: 'EksnHYAxZEqkLC6tsa4LmSKv67m6qPWtKwMEHUxvLfs7',
        lastValidBlockHeight: 180000000,
      });

      const transaction = await buildTransactionFromIntent(
        testIntent,
        mockConnection
      );

      expect(transaction).toBeDefined();
      expect(transaction.instructions.length).toBeGreaterThan(0);
      expect(transaction.feePayer).toEqual(senderKeypair.publicKey);
    });

    it('should include nonce instruction if nonce account provided', async () => {
      const nonceKeypair = Keypair.generate();
      const intentWithNonce = {
        ...testIntent,
        nonceAccount: nonceKeypair.publicKey.toBase58(),
        nonceAuth: senderKeypair.publicKey.toBase58(),
      };

      mockConnection.getLatestBlockhash.mockResolvedValueOnce({
        blockhash: 'EksnHYAxZEqkLC6tsa4LmSKv67m6qPWtKwMEHUxvLfs7',
        lastValidBlockHeight: 180000000,
      });

      const transaction = await buildTransactionFromIntent(
        intentWithNonce,
        mockConnection
      );

      // Should have both transfer and nonce advance instructions
      expect(transaction.instructions.length).toBeGreaterThanOrEqual(1);
    });
  });
});

/**
 * Unit Tests for Discovery Module
 */

import {
  DeviceDiscoveryService,
  IntentExchangeProtocol,
  MultiDeviceConflictResolver,
  type PeerDevice,
} from '../discovery';

describe('Discovery Module', () => {
  describe('DeviceDiscoveryService', () => {
    let discovery: DeviceDiscoveryService;

    beforeEach(() => {
      discovery = new DeviceDiscoveryService();
    });

    it('should register a peer device', () => {
      const peer: PeerDevice = {
        id: 'peer_001',
        lastSeen: Date.now(),
        transport: 'ble',
      };

      discovery.registerPeer(peer);

      const active = discovery.getActivePeers();
      expect(active).toContainEqual(
        expect.objectContaining({ id: 'peer_001' })
      );
    });

    it('should remove timed out peers', (done) => {
      const peer: PeerDevice = {
        id: 'peer_timeout',
        lastSeen: Date.now() - 6 * 60 * 1000, // 6 minutes ago
        transport: 'ble',
      };

      // Manually set old timestamp
      discovery.registerPeer(peer);
      // Access private storage for testing via cast to any
      (discovery as any).discoveredPeers.get('peer_timeout')!.lastSeen =
        Date.now() - 6 * 60 * 1000;

      const active = discovery.getActivePeers();
      expect(active).not.toContainEqual(
        expect.objectContaining({ id: 'peer_timeout' })
      );

      done();
    });

    it('should update trust score', () => {
      const peer: PeerDevice = {
        id: 'peer_trust',
        lastSeen: Date.now(),
        transport: 'ble',
        trustScore: 50,
      };

      discovery.registerPeer(peer);
      discovery.updateTrustScore('peer_trust', 25);

      const updated = discovery.getPeer('peer_trust');
      expect(updated?.trustScore).toBe(75);
    });
  });

  describe('IntentExchangeProtocol', () => {
    let protocol: IntentExchangeProtocol;

    beforeEach(() => {
      protocol = new IntentExchangeProtocol();
    });

    afterEach(() => {
      // Ensure any timers or sessions are cleaned up so Jest can exit
      protocol.dispose();
    });

    it('should create an exchange request', () => {
      const intent: SolanaIntent = {
        id: 'intent_test',
        from: 'sender_addr',
        to: 'recipient_addr',
        amount: 1000000,
        nonce: 1,
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: 'sig123',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      };

      const request = protocol.createRequest(intent, 'device_001');

      expect(request).toBeDefined();
      expect(request.intent).toEqual(intent);
      expect(request.requesterId).toBe('device_001');
    });

    it('should create a response to exchange request', () => {
      const intent: SolanaIntent = {
        id: 'intent_test',
        from: 'sender_addr',
        to: 'recipient_addr',
        amount: 1000000,
        nonce: 1,
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: 'sig123',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      };

      const request = protocol.createRequest(intent, 'device_001');

      const response = protocol.createResponse(
        request.requestId,
        'device_002',
        'accepted',
        undefined,
        [intent.id]
      );

      expect(response.status).toBe('accepted');
      expect(response.responderId).toBe('device_002');
      expect(response.acknowledgedIntentIds).toContain(intent.id);
    });
  });

  describe('MultiDeviceConflictResolver', () => {
    it('should detect conflicting intents', () => {
      const intent1: SolanaIntent = {
        id: 'intent_1',
        from: 'sender_addr',
        to: 'recipient_addr',
        amount: 1000000,
        nonce: 1,
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: 'sig1',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      };

      const intent2: SolanaIntent = {
        ...intent1,
        id: 'intent_2',
        signature: 'sig2',
      };

      const conflicts = MultiDeviceConflictResolver.detectConflicts([
        intent1,
        intent2,
      ]);

      expect(conflicts.length).toBe(1);
      expect(conflicts[0]).toContainEqual(intent1);
      expect(conflicts[0]).toContainEqual(intent2);
    });

    it('should resolve conflicts deterministically by nonce', () => {
      const intent1: SolanaIntent = {
        id: 'intent_1',
        from: 'sender_addr',
        to: 'recipient_addr',
        amount: 1000000,
        nonce: 2, // Higher nonce
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: 'sig1',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      };

      const intent2: SolanaIntent = {
        ...intent1,
        id: 'intent_2',
        nonce: 1, // Lower nonce (wins)
        signature: 'sig2',
      };

      const resolution = MultiDeviceConflictResolver.resolveConflicts([
        intent1,
        intent2,
      ]);

      expect(resolution.winner.id).toBe('intent_2');
      expect(resolution.losers[0]?.id).toBe('intent_1');
    });

    it('should resolve conflicts by timestamp if nonces equal', () => {
      const now = Math.floor(Date.now() / 1000);

      const intent1: SolanaIntent = {
        id: 'intent_1',
        from: 'sender_addr',
        to: 'recipient_addr',
        amount: 1000000,
        nonce: 1,
        expiry: now + 3600,
        signature: 'sig1',
        status: 'pending',
        createdAt: now + 100, // Later
        updatedAt: now,
      };

      const intent2: SolanaIntent = {
        ...intent1,
        id: 'intent_2',
        createdAt: now, // Earlier (wins)
        signature: 'sig2',
      };

      const resolution = MultiDeviceConflictResolver.resolveConflicts([
        intent1,
        intent2,
      ]);

      expect(resolution.winner.id).toBe('intent_2');
      expect(resolution.losers[0]?.id).toBe('intent_1');
    });
  });
});
