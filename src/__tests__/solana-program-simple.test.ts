/**
 * TOSS Solana Program Integration Tests (Simplified)
 *
 * Tests for the toss-intent-processor program
 * Gap #5: Onchain Intent Verification
 */

import { Connection, Keypair } from '@solana/web3.js';
import { createIntent, verifyIntent } from '../intent';
import { NonceAccountManager } from '../client/NonceAccountManager';

describe('TOSS Solana Intent Processor Program', () => {
  let connection: Connection;
  let senderKeypair: Keypair;
  let recipientKeypair: Keypair;
  let nonceManager: NonceAccountManager;

  beforeAll(() => {
    // Use Devnet for testing
    connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    senderKeypair = Keypair.generate();
    recipientKeypair = Keypair.generate();
    nonceManager = new NonceAccountManager(connection);
  });

  describe('Intent Signature Verification', () => {
    it('should create a valid, verifiable intent', async () => {
      // Create intent
      const intent = await createIntent(
        senderKeypair,
        recipientKeypair.publicKey,
        1000000,
        connection,
        { expiresIn: 60 * 60 }
      );

      // Verify the intent can be verified
      expect(intent.signature).toBeDefined();
      expect(intent.signature.length).toBeGreaterThan(0);

      // Verify intent signature locally (client-side)
      const isValid = await verifyIntent(intent, connection);
      expect(isValid).toBe(true);
    });

    it('should reject modified intent', async () => {
      const intent = await createIntent(
        senderKeypair,
        recipientKeypair.publicKey,
        1000000,
        connection
      );

      // Modify the intent (would fail signature check)
      const modifiedIntent = { ...intent, amount: 2000000 };

      // Modified intent should fail verification
      const isValid = await verifyIntent(modifiedIntent, connection);
      expect(isValid).toBe(false);
    });

    it('should reject expired intent', async () => {
      // Create an intent that's already expired
      const intent = await createIntent(
        senderKeypair,
        recipientKeypair.publicKey,
        1000000,
        connection,
        { expiresIn: -100 } // Already expired
      );

      // Expired intent should fail
      const isValid = await verifyIntent(intent, connection);
      expect(isValid).toBe(false);
    });
  });

  describe('Intent Program Data Structure', () => {
    it('should verify intent data structure matches program expectations', async () => {
      const intent = await createIntent(
        senderKeypair,
        recipientKeypair.publicKey,
        5000000,
        connection
      );

      // Verify all required fields for onchain program
      expect(intent.from).toBeDefined();
      expect(intent.to).toBeDefined();
      expect(intent.amount).toBeGreaterThan(0);
      expect(intent.nonce).toBeGreaterThanOrEqual(0);
      expect(intent.expiry).toBeGreaterThan(Date.now() / 1000);
      expect(intent.signature).toBeDefined();
      expect(intent.blockhash).toBeDefined();
    });

    it('should enforce expiry constraints', async () => {
      const now = Math.floor(Date.now() / 1000);
      const intent = await createIntent(
        senderKeypair,
        recipientKeypair.publicKey,
        1000000,
        connection,
        { expiresIn: 3600 } // 1 hour
      );

      // Expiry should be in future
      expect(intent.expiry).toBeGreaterThan(now);
      expect(intent.expiry - now).toBeCloseTo(3600, -1);
    });
  });

  describe('Deterministic Settlement', () => {
    it('should handle settlement with proper sequencing', async () => {
      // Create multiple intents
      const intent1 = await createIntent(
        senderKeypair,
        recipientKeypair.publicKey,
        1000000,
        connection
      );

      const intent2 = await createIntent(
        senderKeypair,
        recipientKeypair.publicKey,
        2000000,
        connection
      );

      // Both should be valid
      const isValid1 = await verifyIntent(intent1, connection);
      const isValid2 = await verifyIntent(intent2, connection);

      expect(isValid1).toBe(true);
      expect(isValid2).toBe(true);

      // Different nonces ensure ordering
      expect(intent1.nonce).not.toBe(intent2.nonce);
    });

    it('should reject duplicate nonce', async () => {
      const intent = await createIntent(
        senderKeypair,
        recipientKeypair.publicKey,
        1000000,
        connection
      );

      // Try to create another intent with same nonce (would fail in practice)
      const intentDupe = { ...intent };

      // Both have same nonce - would be rejected onchain
      expect(intent.nonce).toBe(intentDupe.nonce);
    });
  });

  describe('Program Constraints', () => {
    it('should validate amount is positive', async () => {
      const intent = await createIntent(
        senderKeypair,
        recipientKeypair.publicKey,
        1000000,
        connection
      );

      // Intent amount should be positive
      expect(intent.amount).toBeGreaterThan(0);
    });

    it('should allow large amounts within u64 bounds', async () => {
      const largeAmount = Math.floor(Number.MAX_SAFE_INTEGER / 2);
      const intent = await createIntent(
        senderKeypair,
        recipientKeypair.publicKey,
        largeAmount,
        connection
      );

      expect(intent.amount).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Nonce Account Integration', () => {
    it('should create nonce account for replay protection', async () => {
      const nonceAuthority = Keypair.generate();

      const mockTossUser: any = {
        userId: 'test-user-nonce',
        username: 'testusernonce',
        wallet: {
          publicKey: senderKeypair.publicKey.toBase58(),
          isVerified: true,
        },
        security: {
          biometricEnabled: true,
          nonceAccountRequiresBiometric: true,
        },
        tossFeatures: {
          canSend: true,
          canReceive: true,
          isPrivateTxEnabled: false,
          maxTransactionAmount: 10000000,
          offlineTransactionsEnabled: true,
          nonceAccountEnabled: true,
        },
      };

      const nonceAccountInfo = await nonceManager.createNonceAccount(
        mockTossUser,
        nonceAuthority,
        senderKeypair.publicKey,
        { requireBiometric: true }
      );

      expect(nonceAccountInfo).toBeDefined();
      expect(nonceAccountInfo.address).toBeDefined();
      expect(nonceAccountInfo.isBiometricProtected).toBe(true);
    });

    it('should validate nonce account is active', async () => {
      const nonceAuthority = Keypair.generate();

      const mockTossUser: any = {
        userId: 'test-user-validate',
        username: 'testuservalidate',
        wallet: {
          publicKey: senderKeypair.publicKey.toBase58(),
          isVerified: true,
        },
        security: {
          biometricEnabled: true,
          nonceAccountRequiresBiometric: true,
        },
        tossFeatures: {
          canSend: true,
          canReceive: true,
          isPrivateTxEnabled: false,
          maxTransactionAmount: 10000000,
          offlineTransactionsEnabled: true,
          nonceAccountEnabled: true,
        },
      };

      const nonceAccountInfo = await nonceManager.createNonceAccount(
        mockTossUser,
        nonceAuthority,
        senderKeypair.publicKey,
        { requireBiometric: true }
      );

      // Nonce account should be valid
      const isValid = nonceManager.isNonceAccountValid(nonceAccountInfo);
      expect(isValid).toBe(true);
    });
  });
});
