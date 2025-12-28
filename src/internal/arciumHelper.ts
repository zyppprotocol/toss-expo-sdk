// import {
//     getArciumEnv,
//     x25519,
//     getMXEPublicKey,
//     RescueCipher,
//   } from "@arcium-hq/client";
import * as Arcium from '@arcium-hq/client';
import type { PublicKey } from '@solana/web3.js';

/**
 * Output from Arcium encryption (internal only)
 */
export type ArciumEncryptedOutput = {
  ciphertext: number[][];
  publicKey: Uint8Array;
  nonce: Uint8Array;
};
/**
 * Internal helper to encrypt a set of numeric values with Arcium.
 * Does not leak anything about Arcium to the SDK consumer.
 *
 * @param mxeProgramId PublicKey of the MXE
 * @param plaintextValues numeric values for encryption
 * @param provider Solana provider (e.g., AnchorProvider)
 */
export async function encryptForArciumInternal(
  mxeProgramId: PublicKey,
  plaintextValues: bigint[],
  provider: any // AnchorProvider or similar
): Promise<ArciumEncryptedOutput> {
  // Required by the Arcium client before encryption
  Arcium.getArciumEnv();

  // 1) Generate a random x25519 keypair
  const privateKey = Arcium.x25519.utils.randomSecretKey();
  const publicKey = Arcium.x25519.getPublicKey(privateKey);

  // 2) Fetch the MXE's public encryption key using the provided provider
  const mxePubKey = await Arcium.getMXEPublicKey(provider, mxeProgramId);

  if (!mxePubKey) {
    throw new Error('MXE public key not found for Arcium encryption');
  }

  // 3) Derive DH shared secret
  const sharedSecret = Arcium.x25519.getSharedSecret(privateKey, mxePubKey);

  // 4) Build the cipher and encrypt the data
  const cipher = new Arcium.RescueCipher(sharedSecret);
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const ciphertext = cipher.encrypt(plaintextValues, nonce);

  return {
    ciphertext,
    publicKey,
    nonce,
  };
}
