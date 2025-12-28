/**
 * Complete Offline Payment Flow Example
 *
 * Demonstrates the full TOSS lifecycle per Section 12 of the Technical Paper:
 * 1. Sender constructs and signs payment intent
 * 2. Intent is exchanged offline via BLE/NFC/QR
 * 3. Both devices store pending intent
 * 4. When connectivity is restored, devices reconcile
 * 5. Intent is submitted onchain with deterministic outcome
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  createUserIntent,
  createIntent,
  type SolanaIntent,
  verifyIntent,
} from '../intent';
import type { TossUser } from '../types/tossUser';
import {
  secureStoreIntent,
  getAllSecureIntents,
} from '../storage/secureStorage';
import {
  deviceDiscovery,
  intentExchange,
  MultiDeviceConflictResolver,
  type PeerDevice,
} from '../discovery';
import { syncToChain } from '../sync';
import { TossError } from '../errors';

/**
 * Example: Sender initiates offline payment using TOSS users
 *
 * User-centric approach: sender and recipient are TossUser objects
 * Intent creation validates user features and transaction limits
 */
export async function exampleInitiateUserPayment(
  senderUser: TossUser,
  senderKeypair: Keypair,
  recipientUser: TossUser,
  amountLamports: number,
  connection: Connection
): Promise<SolanaIntent> {
  console.log(' Creating offline payment intent between TOSS users...');
  console.log(`   From: @${senderUser.username}`);
  console.log(`   To: @${recipientUser.username}`);

  // Create the intent using user objects (validates sender/recipient features)
  const intent = await createUserIntent(
    senderUser,
    senderKeypair,
    recipientUser,
    amountLamports,
    connection,
    {
      expiresIn: 24 * 60 * 60, // Valid for 24 hours
    }
  );

  console.log(` Intent created: ${intent.id}`);
  console.log(`   Amount: ${intent.amount} lamports`);
  console.log(`   Expires at: ${new Date(intent.expiry * 1000).toISOString()}`);

  // Store locally
  await secureStoreIntent(intent);
  console.log(' Intent stored securely locally\n');

  return intent;
}

/**
 * Example: Sender initiates offline payment using addresses (legacy)
 *
 * This simulates a sender who wants to send lamports to a recipient
 * while offline. The intent is created, signed, and stored locally.
 */
export async function exampleInitiateOfflinePayment(
  senderKeypair: Keypair,
  recipientAddress: string,
  amountLamports: number,
  connection: Connection
): Promise<SolanaIntent> {
  console.log(' Creating offline payment intent...');

  // Create the intent (this is done offline, no network needed)
  const intent = await createIntent(
    senderKeypair,
    new PublicKey(recipientAddress),
    amountLamports,
    connection,
    {
      expiresIn: 24 * 60 * 60, // Valid for 24 hours
    }
  );

  console.log(` Intent created: ${intent.id}`);
  console.log(`   From: ${intent.from}`);
  console.log(`   To: ${intent.to}`);
  console.log(`   Amount: ${intent.amount} lamports`);
  console.log(`   Expires at: ${new Date(intent.expiry * 1000).toISOString()}`);

  // Store locally
  await secureStoreIntent(intent);
  console.log(' Intent stored securely locally\n');

  return intent;
}

/**
 * Example: Intent exchange via proximity (BLE/NFC)
 *
 * One device has an intent it wants to share with a nearby peer.
 * This demonstrates the intent exchange protocol.
 */
export async function exampleExchangeIntentWithPeer(
  intent: SolanaIntent,
  localDeviceId: string,
  peerDeviceId: string,
  peerDevice: PeerDevice
): Promise<void> {
  console.log(' Initiating intent exchange with peer...');
  console.log(`   Local Device: ${localDeviceId}`);
  console.log(`   Peer Device: ${peerDeviceId}`);

  // Register the peer
  deviceDiscovery.registerPeer(peerDevice);
  console.log(` Peer registered: ${peerDevice.id}`);

  // Create an exchange request
  const exchangeRequest = intentExchange.createRequest(
    intent,
    localDeviceId,
    undefined,
    5 * 60 // 5 minute expiry
  );

  console.log(` Exchange request created: ${exchangeRequest.requestId}`);
  console.log(`   Intent ID: ${intent.id}`);
  console.log(`   Amount: ${intent.amount} lamports`);

  // In a real scenario, this request would be transmitted via BLE/NFC/QR
  // For this example, we'll simulate the peer receiving and accepting it

  // Simulate peer accepting the request
  const response = intentExchange.createResponse(
    exchangeRequest.requestId,
    peerDeviceId,
    'accepted',
    undefined,
    [intent.id]
  );

  console.log(`\n Peer accepted exchange`);
  console.log(`   Status: ${response.status}`);
  console.log(
    `   Acknowledged intents: ${response.acknowledgedIntentIds?.join(', ')}\n`
  );

  // In a real app, the peer would now have the intent in their local storage
}

/**
 * Example: Multiple devices create conflicting intents
 *
 * Demonstrates TOSS's deterministic conflict resolution when
 * multiple offline devices create intents for the same action.
 */
export async function exampleMultiDeviceConflict(
  connection: Connection
): Promise<void> {
  console.log(' Simulating multi-device conflict scenario...\n');

  // Create keypair for "Device A"
  const senderKeypair = Keypair.generate();
  const recipient = new PublicKey('11111111111111111111111111111111');
  const amount = 1000000; // 0.001 SOL

  // Both devices create identical intents (same sender, recipient, amount)
  // but at slightly different times
  const intentA = await createIntent(
    senderKeypair,
    recipient,
    amount,
    connection,
    { expiresIn: 3600 }
  );

  // Simulate Device B creating same intent 1 second later
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const intentB = await createIntent(
    senderKeypair, // Same sender!
    recipient,
    amount,
    connection,
    { expiresIn: 3600 }
  );

  console.log(' Conflict Detected!');
  console.log(
    `   Device A created intent: ${intentA.id} at ${intentA.createdAt}`
  );
  console.log(
    `   Device B created intent: ${intentB.id} at ${intentB.createdAt}`
  );
  console.log(`   Both intents: Same sender, same recipient, same amount\n`);

  // Use the conflict resolver
  const conflictingIntents = [intentA, intentB];
  const resolution =
    MultiDeviceConflictResolver.resolveConflicts(conflictingIntents);

  console.log('️ Deterministic Resolution Applied:');
  console.log(`   Winner: ${resolution.winner.id}`);
  console.log(`   Winner nonce: ${resolution.winner.nonce}`);
  console.log(
    `   Winner timestamp: ${new Date(resolution.winner.createdAt * 1000).toISOString()}`
  );

  console.log(
    `\n   Losers: ${resolution.losers.map((i: SolanaIntent) => i.id).join(', ')}`
  );
  console.log(`   (These intents will be marked failed during settlement)\n`);
}

/**
 * Example: Full offline-to-settlement flow
 *
 * Shows the complete journey of an intent from creation to onchain settlement.
 */
export async function exampleCompleteOfflineFlow(
  senderKeypair: Keypair,
  recipientAddress: string,
  amountLamports: number,
  connection: Connection
): Promise<void> {
  console.log('='.repeat(60));
  console.log(' TOSS Complete Offline Payment Flow');
  console.log('='.repeat(60) + '\n');

  try {
    // Step 1: Create intent offline
    console.log('STEP 1: Offline Intent Creation');
    console.log('-'.repeat(60));
    const intent = await exampleInitiateOfflinePayment(
      senderKeypair,
      recipientAddress,
      amountLamports,
      connection
    );

    // Step 2: Simulate peer device discovery and exchange
    console.log('STEP 2: Peer Discovery & Intent Exchange');
    console.log('-'.repeat(60));
    const peerDevice: PeerDevice = {
      id: 'device_peer_001',
      lastSeen: Date.now(),
      transport: 'ble',
      signalStrength: -45, // dBm
      trustScore: 75,
    };

    await exampleExchangeIntentWithPeer(
      intent,
      'device_local_001',
      'device_peer_001',
      peerDevice
    );

    // Step 3: Device reconnects and initiates synchronisation
    console.log('STEP 3: Synchronisation with Solana');
    console.log('-'.repeat(60));
    console.log(' Device reconnected to network...');
    console.log(' Initiating sync with Solana blockchain...\n');

    // Check sync status
    const syncResult = await syncToChain(connection);

    console.log(' Sync Results:');
    console.log(
      `   Successful settlements: ${syncResult.successfulSettlements.length}`
    );
    console.log(
      `   Failed settlements: ${syncResult.failedSettlements.length}`
    );
    console.log(
      `   Detected conflicts: ${syncResult.detectedConflicts.length}`
    );
    console.log(`   Overall complete: ${syncResult.isComplete}\n`);

    if (syncResult.successfulSettlements.length > 0) {
      console.log(' Successful Settlements:');
      for (const settlement of syncResult.successfulSettlements) {
        console.log(`   Intent ${settlement.intentId}`);
        console.log(`   Signature: ${settlement.signature}`);
        console.log(
          `   Timestamp: ${new Date(settlement.timestamp * 1000).toISOString()}`
        );
      }
      console.log();
    }

    if (syncResult.failedSettlements.length > 0) {
      console.log(' Failed Settlements:');
      for (const settlement of syncResult.failedSettlements) {
        console.log(`   Intent ${settlement.intentId}`);
        console.log(`   Reason: ${settlement.error}`);
      }
      console.log();
    }

    if (syncResult.detectedConflicts.length > 0) {
      console.log('️ Detected Conflicts:');
      for (const conflict of syncResult.detectedConflicts) {
        console.log(`   Intent ${conflict.intentId}: ${conflict.conflict}`);
      }
      console.log();
    }

    // Step 4: Verify final state
    console.log('STEP 4: Final State Verification');
    console.log('-'.repeat(60));
    const allIntents = await getAllSecureIntents();
    const settledIntents = allIntents.filter(
      (i: SolanaIntent) => i.status === 'settled'
    );
    const failedIntents = allIntents.filter(
      (i: SolanaIntent) => i.status === 'failed'
    );

    console.log(` Intent Storage:
   Total intents: ${allIntents.length}
   Settled: ${settledIntents.length}
   Failed: ${failedIntents.length}\n`);

    console.log(' Flow complete!\n');
    console.log('='.repeat(60));
  } catch (error) {
    console.error(' Error during offline flow:', error);
    if (error instanceof TossError) {
      console.error(`   Error code: ${(error as TossError).code}`);
    }
  }
}

/**
 * Example: Verify intent before exchange
 *
 * Good practice: receivers should verify intent signatures
 * before accepting and storing them.
 */
export async function exampleVerifyIntentBeforeAcceptance(
  intent: SolanaIntent,
  connection: Connection
): Promise<boolean> {
  console.log(' Verifying intent signature...');

  try {
    const isValid = await verifyIntent(intent, connection);

    if (isValid) {
      console.log(' Intent signature is valid');
      console.log(`   From: ${intent.from}`);
      console.log(`   To: ${intent.to}`);
      console.log(`   Amount: ${intent.amount} lamports`);
      return true;
    } else {
      console.log(' Intent signature is invalid');
      return false;
    }
  } catch (error) {
    console.error(' Verification failed:', error);
    return false;
  }
}
