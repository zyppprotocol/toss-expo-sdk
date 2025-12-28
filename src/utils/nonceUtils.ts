import {
  SystemProgram,
  PublicKey,
  Transaction,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

export async function createNonceAccount(
  connection: Connection,
  feePayer: Keypair,
  nonceAccount: Keypair = Keypair.generate(),
  amount = 1 * LAMPORTS_PER_SOL // 1 SOL should be enough for many transactions
): Promise<{ nonceAccount: Keypair; nonceAuth: PublicKey }> {
  const nonceAuth = feePayer.publicKey;
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: feePayer.publicKey,
      newAccountPubkey: nonceAccount.publicKey,
      lamports: amount,
      space: 80, // Size of nonce account
      programId: SystemProgram.programId,
    }),
    SystemProgram.nonceInitialize({
      noncePubkey: nonceAccount.publicKey,
      authorizedPubkey: nonceAuth,
    })
  );

  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = feePayer.publicKey;
  tx.sign(feePayer, nonceAccount);

  await connection.sendRawTransaction(tx.serialize());
  return { nonceAccount, nonceAuth };
}

export async function getNonce(
  connection: Connection,
  nonceAccount: PublicKey
): Promise<string> {
  const accountInfo = await connection.getAccountInfo(nonceAccount);
  if (!accountInfo) throw new Error('Nonce account not found');
  return accountInfo.data.slice(32, 64).toString('hex');
}

export function createNonceAdvanceInstruction(
  noncePubkey: PublicKey,
  authorizedPubkey: PublicKey
) {
  return SystemProgram.nonceAdvance({
    noncePubkey,
    authorizedPubkey,
  });
}
