// Minimal mock of @solana/web3.js for unit tests

class PublicKey {
  constructor(value) {
    this._value = value?.toString?.() ?? String(value);
  }
  toBase58() {
    return this._value;
  }
  toBytes() {
    // Return deterministic 32 bytes from string (simple hash-like mapping)
    const bytes = new Uint8Array(32);
    for (let i = 0; i < this._value.length && i < 32; i++) {
      // Avoid bitwise to satisfy lint: keep values within 0-255 using modulo
      bytes[i] = this._value.charCodeAt(i) % 256;
    }
    return bytes;
  }
}

class Keypair {
  constructor() {
    this.publicKey = new PublicKey(
      'mock_' + Date.now() + '_' + Math.floor(Math.random() * 1000)
    );
    this.secretKey = new Uint8Array(64);
  }
  static generate() {
    return new Keypair();
  }
}

class Transaction {
  constructor() {
    this.instructions = [];
    this.feePayer = null;
    this.recentBlockhash = undefined;
    this.lastValidBlockHeight = undefined;
  }
  add(instr) {
    this.instructions.push(instr);
  }
  serialize() {
    // Return a Uint8Array to avoid Buffer dependency in test env
    return new Uint8Array();
  }
}

const SystemProgram = {
  transfer: ({ fromPubkey, toPubkey, lamports }) => ({
    type: 'transfer',
    fromPubkey,
    toPubkey,
    lamports,
  }),
  nonceAdvance: ({ noncePubkey, authorizedPubkey }) => ({
    type: 'nonceAdvance',
    noncePubkey,
    authorizedPubkey,
  }),
};

module.exports = {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
};
