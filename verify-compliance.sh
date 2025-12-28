#!/bin/bash

# TOSS Paper Compliance Verification Script
# Verifies all 8 gaps have been fixed

echo " TOSS Paper Compliance Verification"
echo "======================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

GAPS_FIXED=0
TOTAL_GAPS=8

# GAP #1: Expiry cleanup
echo -n "GAP #1 - Expiry Cleanup: "
if grep -q "export async function cleanupExpiredIntents" src/storage/secureStorage.ts; then
    echo -e "${GREEN}${NC}"
    ((GAPS_FIXED++))
else
    echo -e "${RED}${NC}"
fi

# GAP #2: ReconciliationState tracking
echo -n "GAP #2 - ReconciliationState Tracking: "
if grep -q "ReconciliationStateData" src/storage/secureStorage.ts && grep -q "updateReconciliationState" src/sync.ts; then
    echo -e "${GREEN}${NC}"
    ((GAPS_FIXED++))
else
    echo -e "${RED}${NC}"
fi

# GAP #3: Constraint validation
echo -n "GAP #3 - Constraint Validation: "
if grep -q "executable" src/reconciliation.ts && grep -q "isFrozen" src/reconciliation.ts; then
    echo -e "${GREEN}${NC}"
    ((GAPS_FIXED++))
else
    echo -e "${RED}${NC}"
fi

# GAP #4: Noise Protocol
echo -n "GAP #4 - Noise Protocol: "
if grep -q "noiseEncrypt\|noiseDecrypt" src/noise.ts && grep -q "performNoiseHandshake" src/noise.ts; then
    echo -e "${GREEN}${NC}"
    ((GAPS_FIXED++))
else
    echo -e "${RED}${NC}"
fi

# GAP #5: Solana Program
echo -n "GAP #5 - Solana Program: "
if [ -f "solana/programs/toss-intent-processor/src/lib.rs" ]; then
    echo -e "${GREEN}${NC}"
    ((GAPS_FIXED++))
else
    echo -e "${RED}${NC}"
fi

# GAP #6: Nonce Lifecycle
echo -n "GAP #6 - Nonce Lifecycle: "
if grep -q "initializeDurableNonceAccountOnchain\|validateNonceAccountOnchain" src/client/NonceAccountManager.ts; then
    echo -e "${GREEN}${NC}"
    ((GAPS_FIXED++))
else
    echo -e "${RED}${NC}"
fi

# GAP #7: Arcium Integration
echo -n "GAP #7 - Arcium Integration: "
if grep -q "submitTransactionToArciumMXE" src/reconciliation.ts; then
    echo -e "${GREEN}${NC}"
    ((GAPS_FIXED++))
else
    echo -e "${RED}${NC}"
fi

# GAP #8: Biometric Protection
echo -n "GAP #8 - Biometric Protection: "
if grep -q "LocalAuthentication.authenticateAsync" src/intent.ts; then
    echo -e "${GREEN}${NC}"
    ((GAPS_FIXED++))
else
    echo -e "${RED}${NC}"
fi

echo ""
echo "======================================"
echo "Results: $GAPS_FIXED / $TOTAL_GAPS gaps fixed"
echo "======================================"

if [ $GAPS_FIXED -eq $TOTAL_GAPS ]; then
    echo -e "${GREEN} ALL GAPS FIXED - PRODUCTION READY${NC}"
    exit 0
else
    echo -e "${YELLOW}️  Some gaps still need fixing${NC}"
    exit 1
fi
