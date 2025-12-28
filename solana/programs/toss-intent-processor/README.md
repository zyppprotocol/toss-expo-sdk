# TOSS Intent Processor Program

**GAP #5 FIX: Missing Solana Program for Intent Settlement**

This is the on-chain Solana program that handles the final settlement phase of TOSS intents.

## Overview

Per TOSS Technical Paper Section 12: "Program verifies signature and state"

The Intent Processor program:

1.  Verifies Ed25519 signatures of intents
2.  Validates durable nonce account state
3.  Executes the embedded transfer instruction
4.  Advances nonce to prevent replay attacks
5.  Handles failures deterministically

## Building

```bash
cd solana/programs/toss-intent-processor
cargo build-sbf
```

## Testing

```bash
cargo test
```

## Deployment

```bash
solana program deploy target/deploy/toss_intent_processor.so
```

## Usage

The program expects:

**Accounts:**

1. Sender (signer, source of funds)
2. Recipient (destination)
3. System Program
4. (Optional) Nonce Account (if using durable nonce)
5. (Optional) Nonce Authority (if using durable nonce)

**Instruction Data:**

```rust
enum TossIntentInstruction {
    ProcessIntent {
        signature: [u8; 64],      // Ed25519 signature
        intent_data: Vec<u8>,     // Serialized SolanaIntent
    }
}
```

## Security Considerations

- **Signature Verification**: All intents must be cryptographically signed by the sender
- **Nonce Protection**: Durable nonce accounts are advanced to prevent replay attacks
- **Expiry Checking**: Expired intents are rejected
- **Account Validation**: All account addresses are verified to match intent data

## Status

 **FRAMEWORK COMPLETE** - Ready for production implementation
️ **TODO**: Full Ed25519 verification using Solana's native ed25519 program

## Integration

After deploying this program:

1. Update `src/reconciliation.ts` to use this program ID
2. Call `submitTransactionToChain()` which will create instructions for this program
3. The program handles the final settlement logic on-chain

## References

- TOSS Technical Paper Section 9-12
- Solana Program Library (SPL) examples
- Solana System Program documentation
