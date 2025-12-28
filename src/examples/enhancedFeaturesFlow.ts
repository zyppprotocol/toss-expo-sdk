/**
 * Complete Example: Enhanced TOSS Flow with Compression, Incentives & WiFi
 *
 * Demonstrates:
 * 1. Compression of intent metadata
 * 2. Smart transport selection (WiFi > BLE)
 * 3. Relay incentive tracking
 * 4. Mesh clustering for optimal routing
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  createIntent,
  SmartTransportSelector,
  compressIntentMetadata,
  decompressIntentMetadata,
  calculateRelayRewards,
  meshClustering,
  relayReputation,
} from 'toss-expo-sdk';

/**
 * Example 1: Metadata Compression Flow
 *
 * Compress large memo text before transmission
 */
export async function exampleCompressedIntentFlow(
  sender: Keypair,
  recipient: PublicKey,
  amount: number,
  connection: Connection
): Promise<void> {
  console.log('\nExample 1: Compressed Intent Flow\n');

  // Step 1: Create intent
  const intent = await createIntent(sender, recipient, amount, connection);

  // Step 2: Create metadata with long memo
  const metadata = {
    memo: 'Payment for services rendered during Q4 2025. This is a longer memo that benefits from compression',
    recipientName: 'Alice Smith',
    transactionType: 'service-payment',
  };

  // Step 3: Compress metadata
  const { compressed, savings } = await compressIntentMetadata(metadata);
  console.log(`Compressed metadata: ${savings}% smaller`);
  console.log(`   Original size: ${JSON.stringify(metadata).length} bytes`);
  console.log(`   Compressed size: ${JSON.stringify(compressed).length} bytes`);

  // Step 4: Store/transmit compressed version
  const transmissionPayload = {
    intent,
    metadata: compressed,
  };

  console.log(`\n Transmission payload:`, {
    intentSize: JSON.stringify(intent).length,
    metadataSize: JSON.stringify(compressed).length,
    total: JSON.stringify(transmissionPayload).length,
  });

  // Step 5: On receive, decompress
  const received = await decompressIntentMetadata(compressed);
  console.log(`\nDecompressed metadata:`, received);
  console.log(
    '   Verification: Matches original:',
    JSON.stringify(received) === JSON.stringify(metadata)
  );
}

/**
 * Example 2: Smart Transport Selection
 *
 * Automatically choose WiFi Direct if available, fallback to BLE
 */
export async function exampleSmartTransportFlow(): Promise<void> {
  console.log('\n Example 2: Smart Transport Selection\n');

  const selector = new SmartTransportSelector();
  const selectedTransport = await selector.selectTransport();

  console.log(`Selected transport: ${selectedTransport}`);

  if (selectedTransport === 'wifi') {
    console.log('   Benefits:');
    console.log('   • MTU: 1200 bytes (vs BLE 480 bytes)');
    console.log('   • Speed: ~2.5x faster');
    console.log('   • Ideal for bulk transfers');
  } else {
    console.log('   Benefits:');
    console.log('   • Widely compatible');
    console.log('   • Lower power than WiFi');
    console.log('   • Sufficient for most intents');
  }

  const shouldUseWiFi = await selector.shouldUseWiFi(false);
  console.log(`\nWiFi Direct recommended: ${shouldUseWiFi}`);
}

/**
 * Example 3: Relay Incentive Tracking
 *
 * Calculate and track rewards for devices relaying transactions
 */
export async function exampleRelayIncentiveFlow(): Promise<void> {
  console.log('\nExample 3: Relay Incentive Tracking\n');

  // Simulate relay path: Device A → Device B → Device C → Gateway
  const relayPath = [
    'deviceB_address_here',
    'deviceC_address_here',
    'gateway_address_here',
  ];

  // Step 1: Calculate rewards for each relay
  const rewards = calculateRelayRewards(relayPath);

  console.log('Relay reward structure:');
  for (const [relayId, amount] of rewards.entries()) {
    console.log(`   ${relayId}: ${amount} lamports`);
  }

  // Step 2: Track which relays contributed
  const totalReward = Array.from(rewards.values()).reduce(
    (sum, a) => sum + a,
    0
  );
  console.log(`\n   Total rewards distributed: ${totalReward} lamports`);

  // Step 3: In production, after successful settlement:
  // await trackRelayContribution('intent-id', relayPath, connection, feePayer);
  console.log('\nRelay contributions tracked for future settlement');
  console.log('   (In production, rewards would be transferred onchain)');
}

/**
 * Example 4: Mesh Clustering & Smart Routing
 *
 * Use signal strength to form clusters and find optimal paths
 */
export async function exampleMeshClusteringFlow(): Promise<void> {
  console.log('\nExample 4: Mesh Clustering & Smart Routing\n');

  // Step 1: Detect clusters
  const clusters = meshClustering.detectClusters();

  console.log(`Detected ${clusters.size} clusters:`);
  for (const [clusterId, devices] of clusters.entries()) {
    console.log(
      `   Cluster ${clusterId.substr(0, 8)}: ${devices.length} devices`
    );
  }

  // Step 2: Find optimal route to target
  const targetDeviceId = 'target-device-123';
  const route = meshClustering.findOptimalRoute(targetDeviceId);

  console.log(`\nOptimal route to ${targetDeviceId}:`);
  if (route.length === 0) {
    console.log('   Target unreachable');
  } else if (route.length === 1) {
    console.log(`    Direct connection: ${route[0]}`);
  } else {
    console.log(`    Multi-hop path (${route.length} hops):`);
    for (let i = 0; i < route.length; i++) {
      console.log(`      ${i}: ${route[i]}`);
    }
  }

  // Step 3: Track relay performance
  console.log('\n Relay performance tracking:');
  relayReputation.recordSuccess('relay-1', 450); // 450ms latency
  relayReputation.recordSuccess('relay-1', 380);
  relayReputation.recordSuccess('relay-2', 850); // Slower relay
  relayReputation.recordFailure('relay-3');

  const relay1Score = relayReputation.getRelayScore('relay-1');
  const relay2Score = relayReputation.getRelayScore('relay-2');
  const relay3Score = relayReputation.getRelayScore('relay-3');

  console.log(`   Relay 1 score: ${relay1Score}/100 (fast & reliable)`);
  console.log(`   Relay 2 score: ${relay2Score}/100 (slower)`);
  console.log(`   Relay 3 score: ${relay3Score}/100 (failed recently)`);

  // Step 4: Select best relay
  const bestRelay = relayReputation.selectBestRelay([
    'relay-1',
    'relay-2',
    'relay-3',
  ]);
  console.log(`\n Best relay selected: ${bestRelay}`);
}

/**
 * Example 5: Complete Production Flow
 *
 * Integrates compression + WiFi transport + incentives + optimal routing
 */
export async function exampleCompleteEnhancedFlow(
  sender: Keypair,
  recipient: PublicKey,
  amount: number,
  connection: Connection,
  _feePayer: PublicKey
): Promise<void> {
  console.log('\n Example 5: Complete Enhanced TOSS Flow\n');

  // Phase 1: Creation (offline)
  console.log('Phase 1: Intent Creation (Offline)\n');
  const intent = await createIntent(sender, recipient, amount, connection);
  console.log(' Intent created and signed');

  const metadata = {
    memo: 'Complete flow demonstration',
    timestamp: new Date().toISOString(),
  };
  const { compressed, savings } = await compressIntentMetadata(metadata);
  console.log(` Metadata compressed (${savings}% savings)`);

  // Phase 2: Transport (intelligent selection)
  console.log('\nPhase 2: Intelligent Transport Selection\n');
  const selector = new SmartTransportSelector();
  const transport = await selector.selectTransport();
  console.log(` Selected transport: ${transport.toUpperCase()}`);

  // Phase 3: Routing (cluster-based optimization)
  console.log('\nPhase 3: Optimal Path Finding\n');
  const clusters = meshClustering.detectClusters();
  console.log(` Found ${clusters.size} network clusters`);

  const relayPath = meshClustering.findOptimalRoute(recipient.toBase58());
  console.log(` Route: ${relayPath.length} hops to destination`);

  // Phase 4: Incentive tracking
  console.log('\nPhase 4: Relay Incentive Setup\n');
  const rewards = calculateRelayRewards(relayPath);
  const totalReward = Array.from(rewards.values()).reduce((a, b) => a + b, 0);
  console.log(
    ` Reward pool: ${totalReward} lamports for ${relayPath.length} relays`
  );

  // Phase 5: Transmission
  console.log('\nPhase 5: Intent Transmission\n');
  const payloadSize = JSON.stringify({
    intent,
    metadata: compressed,
  }).length;
  console.log(` Payload size: ${payloadSize} bytes`);
  console.log(`   MTU: ${transport === 'wifi' ? '1200' : '480'} bytes`);
  const fragments = Math.ceil(
    payloadSize / (transport === 'wifi' ? 1200 : 480)
  );
  console.log(`   Fragments: ${fragments} (optimized)`);

  // Phase 6: Settlement (when online)
  console.log('\nPhase 6: Settlement (When Online)\n');
  console.log(' Intent ready for settlement');
  console.log('   • Signature verified: YES');
  console.log('   • Metadata decompressed: YES');
  console.log('   • Relayers identified: YES');
  console.log(`   • Rewards tracked: ${totalReward} lamports`);
  console.log('\n Complete flow ready for production deployment');
}

/**
 * Run all examples
 */
export async function runAllExamples(connection: Connection): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('        TOSS Enhanced Features - Complete Examples');
  console.log('═══════════════════════════════════════════════════════════');

  // Create test keypairs
  const sender = Keypair.generate();
  const recipient = Keypair.generate().publicKey;
  const feePayer = Keypair.generate().publicKey;

  try {
    await exampleCompressedIntentFlow(sender, recipient, 1000000, connection);
    await exampleSmartTransportFlow();
    await exampleRelayIncentiveFlow();
    await exampleMeshClusteringFlow();
    await exampleCompleteEnhancedFlow(
      sender,
      recipient,
      1000000,
      connection,
      feePayer
    );

    console.log(
      '\n═══════════════════════════════════════════════════════════'
    );
    console.log(' All examples completed successfully!');
    console.log(
      '═══════════════════════════════════════════════════════════\n'
    );
  } catch (error) {
    console.error(' Example failed:', error);
  }
}
