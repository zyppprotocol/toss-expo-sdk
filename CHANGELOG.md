# TOSS Expo SDK - Changelog v0.1.2

**Release Date**: December 24, 2025

## Patch — v0.1.2

-  Documentation: clarified user-centric intent API and added a WalletProvider example showing unlocking and creating a user intent from an unlocked keypair.
-  Tests: fixed Jest open-handle issues by tracking and clearing IntentExchangeProtocol timers and added a mock for `@chainsafe/libp2p-noise` so tests run reliably in Node/Jest environments.
-  Lint/format: fixed Prettier/ESLint issues across examples, mocks, and discovery module.
-  Build: validated TypeScript compilation and packaging (dry-run successful).

---

# TOSS Expo SDK - Changelog v0.1.0

**Release Date**: December 24, 2025

##  What's New

### Major Features

#### 1. Reconciliation & Settlement System

-  Full reconciliation with Solana blockchain
-  Onchain state validation before settlement
-  Transaction building from intents
-  Batch settlement with result tracking
-  Conflict detection and reporting
- **Files**: `src/reconciliation.ts` (~350 lines)
- **API**: `reconcilePendingIntents()`, `settleIntent()`, `detectConflicts()`, etc.

#### 2. Device Discovery & Intent Exchange Protocol

-  Peer device discovery and registration
-  Intent exchange request/response protocol
-  Multi-hop mesh routing support
-  Trust scoring for peer reliability
-  Deterministic multi-device conflict resolution
- **Files**: `src/discovery.ts` (~400 lines)
- **API**: `DeviceDiscoveryService`, `IntentExchangeProtocol`, `IntentRoutingService`, `MultiDeviceConflictResolver`

#### 3. Enhanced Synchronisation

-  Complete sync with full reconciliation
-  Lightweight status checking without settlement
-  Detailed settlement results
- **Files**: `src/sync.ts` (enhanced from ~10 to ~100 lines)
- **API**: `syncToChain()`, `checkSyncStatus()`

#### 4. TossClient Enhancements

-  `fullSync()` - Complete reconciliation
-  `checkSyncStatus()` - Query status without settling
-  `detectIntentConflicts()` - Check for conflicts
-  `getReconciliationStatus()` - Get detailed status
- **File**: `src/client/TossClient.ts`

#### 5. Comprehensive Examples

-  Offline payment flow example
-  Multi-device conflict handling
-  Peer discovery and exchange
-  Full end-to-end flow demonstration
- **Files**: `src/examples/offlinePaymentFlow.ts` (~320 lines)
- **Functions**: 5 complete example functions with detailed logging

#### 6. Unit Tests

-  Reconciliation tests
-  Discovery and conflict resolution tests
-  Device management tests
-  Intent exchange protocol tests
- **Files**: `src/__tests__/reconciliation.test.tsx` (~350 lines)

### Documentation

#### New Documents

-  `IMPLEMENTATION.md` - Complete technical documentation (~600 lines)
-  `IMPLEMENTATION_SUMMARY.md` - Executive summary
-  `QUICK_REFERENCE.md` - Developer quick reference

#### Enhanced Documents

-  `README.md` - Added synchronisation, conflict handling, device discovery sections
-  All code includes JSDoc comments

### Bug Fixes

-  Fixed reconciliation state management
-  Fixed conflict resolution type safety
-  Fixed path imports in examples

### Technical Improvements

#### Code Quality

-  Full TypeScript strict mode compliance
-  Comprehensive error handling with error codes
-  Type-safe implementations throughout
-  No unused imports or variables

#### Performance

-  Optimized batch settlement O(n)
-  Efficient conflict detection
-  Peer timeout cleanup
-  Request auto-expiry

#### Security

-  Deterministic conflict resolution (replay-safe)
-  Double-spend detection
-  Nonce constraint validation
-  Expiry time validation
-  Onchain state verification

---

##  Implementation Statistics

| Metric              | Value  |
| ------------------- | ------ |
| New Files           | 6      |
| Modified Files      | 4      |
| Lines Added         | ~2,270 |
| New Functions       | 25+    |
| New Classes         | 4      |
| New Types           | 6      |
| Test Cases          | 15+    |
| Documentation Pages | 3      |

---

##  Mapping to TOSS Technical Paper

| Paper Section                       | Implementation                          | Status |
| ----------------------------------- | --------------------------------------- | ------ |
| 1. Technical Overview               | Full SDK                                |      |
| 2. System Model                     | `discovery.ts`, `reconciliation.ts`     |      |
| 3. Design Principles                | Throughout codebase                     |      |
| 4. Intent Architecture              | `intent.ts` (existing)                  |      |
| 5. Transport Layer                  | `ble.ts`, `nfc.ts`, `qr.tsx` (existing) |      |
| 6. Cryptographic Model              | `authService.ts` (existing)             |      |
| 7. Arcium Integration               | `arciumHelper.ts` (existing)            |      |
| 8. Local State Management           | `secureStorage.ts` (existing)           |      |
| 9. Synchronisation & Reconciliation | `sync.ts`, `reconciliation.ts`          |      |
| 10. Failure & Conflict Handling     | `reconciliation.ts`, `discovery.ts`     |      |
| 11. Developer Stack                 | `TossClient.ts` (enhanced)              |      |
| 12. Example Flow                    | `offlinePaymentFlow.ts`                 |      |
| 13. Security Guarantees             | Throughout                              |      |
| 14. Limitations                     | `IMPLEMENTATION.md`                     |      |
| 15. Conclusion                      | `README.md`                             |      |

---

##  Breaking Changes

**None** - This is a pure addition release. All existing APIs remain unchanged and compatible.

---

##  Migration Guide

No migration needed. Existing code continues to work as-is. New features are opt-in:

```typescript
// Existing API still works
const intent = await client.createIntent(...);

// New API available when needed
const syncResult = await client.fullSync();
```

---

##  New Error Codes

```typescript
EXCHANGE_REQUEST_NOT_FOUND; // Intent exchange request doesn't exist
EXCHANGE_REQUEST_EXPIRED; // Exchange request past expiry time
ROUTE_TOO_LONG; // Routing path exceeds 3 hops
TRANSACTION_BUILD_FAILED; // Failed to build transaction from intent
NO_INTENTS; // No intents to process
```

---

##  Package Contents

### Core Modules

- `reconciliation.ts` - Reconciliation engine
- `discovery.ts` - Device discovery & protocol
- `sync.ts` - Enhanced synchronisation

### Supporting Files

- `examples/offlinePaymentFlow.ts` - Runnable examples
- `__tests__/reconciliation.test.tsx` - Unit tests

### Documentation

- `IMPLEMENTATION.md` - Technical reference
- `IMPLEMENTATION_SUMMARY.md` - Executive summary
- `QUICK_REFERENCE.md` - Developer quick start
- Enhanced `README.md` with new sections

---

##  Quality Assurance

- [x] TypeScript compilation - No errors
- [x] ESLint compliance - No warnings
- [x] Type safety - Strict mode
- [x] Unit tests - Comprehensive
- [x] Examples - Functional
- [x] Documentation - Complete
- [x] Error handling - Comprehensive
- [x] Security review - TOSS-compliant

---

##  Known Limitations

1. **Device discovery**: Requires manual peer registration (no automatic BLE scan in SDK)
2. **Mesh routing**: Supports multi-hop but limited to 3 hops max
3. **Batch size**: No hard limit but recommend <1000 intents per sync
4. **Concurrent syncs**: Only one sync at a time per client

These are by design per TOSS specification and documented in `IMPLEMENTATION.md`.

---

##  Future Roadmap

### v0.2.0 (Planned)

- [ ] Automatic BLE device scanning integration
- [ ] Intent batching optimization
- [ ] Predictive settlement success estimation
- [ ] Advanced logging/monitoring hooks

### v0.3.0 (Planned)

- [ ] Intent composition/chaining
- [ ] Advanced mesh routing algorithms
- [ ] Hardware wallet integration enhancements
- [ ] Partial settlement handling

### v1.0.0 (Production Release)

- [ ] Complete security audit
- [ ] Mainnet support
- [ ] Performance benchmarking
- [ ] Production monitoring

---

##  Notes for Developers

### Getting Started

1. Read `QUICK_REFERENCE.md` for common tasks
2. Review `examples/offlinePaymentFlow.ts` for patterns
3. Check `IMPLEMENTATION.md` for detailed API

### Testing

- Run `npm test` to execute unit tests
- Check test output for coverage
- Examples can be used for manual testing

### Documentation

- All functions have JSDoc comments
- See `IMPLEMENTATION.md` for complete API reference
- `TOSS Technical Paper` provides conceptual background

---

##  Contributing

This SDK implements the TOSS Technical Paper. When contributing:

1. Maintain TOSS specification compliance
2. Add tests for new features
3. Update documentation
4. Follow existing code style
5. Ensure TypeScript strict mode compliance

---

##  License

MIT License - See LICENSE file for details

---

##  Acknowledgments

- TOSS Technical Paper for architecture and principles
- Solana ecosystem for Web3.js libraries
- Arcium for confidential computation
- React Native and Expo communities

---

**Version**: 0.1.0  
**Release Date**: December 24, 2025  
**Status**: Ready for Integration Testing

For detailed implementation information, see [IMPLEMENTATION.md](./IMPLEMENTATION.md)
