# Merkle Airdrop - Quick Start Guide

## Installation

Install the required packages:

```bash
npm install merkletreejs keccak256
```

## Quick Test

Test the airdrop functionality locally:

```bash
npx hardhat run scripts/testAirdrop.js
```

This will:
1. Deploy the contract locally
2. Generate a merkle tree with sample data
3. Set the merkle root
4. Simulate multiple users claiming
5. Test security (double-claim, invalid proof)

## Generate Merkle Tree

Generate merkle tree for your airdrop recipients:

```bash
npx hardhat run scripts/generateMerkleTree.js
```

Output: `airdrop-merkle-data.json`

## Run Tests

Run the full test suite including 11 merkle airdrop tests:

```bash
npx hardhat test
```

Expected: **34 tests passing** (23 core + 11 airdrop)

## Files Created

- **Contract**: `contracts/HashLierre.sol` (updated with merkle functions)
- **Generator Script**: `scripts/generateMerkleTree.js`
- **Test Script**: `scripts/testAirdrop.js`
- **Tests**: `test/HashLierre.test.cjs` (11 new airdrop tests added)
- **Documentation**: `MERKLE_AIRDROP_GUIDE.md` (full guide)

## New Contract Functions

### Owner Functions
- `setMerkleRoot(bytes32)` - Set merkle root for airdrop

### User Functions
- `claimAirdrop(uint256 amount, bytes32[] proof)` - Claim airdrop
- `hasClaimedAirdrop(address)` - Check claim status

### Storage
- `merkleRoot` - Current merkle root
- `airdropClaimed[address]` - Claim tracking

## Usage Example

```javascript
// 1. Generate tree
const { generateMerkleTree } = require('./scripts/generateMerkleTree');
const data = await generateMerkleTree();

// 2. Set root
await token.setMerkleRoot(data.merkleRoot);

// 3. Users claim
const userProof = data.recipients.find(r => r.address === userAddress);
await token.claimAirdrop(userProof.amount, userProof.proof);
```

## Gas Costs

- **Set merkle root**: ~45,000 gas (~$3 on mainnet)
- **Claim airdrop**: ~65,000 gas per user (users pay)
- **For 1000 recipients**: Owner pays ~$3 vs ~$3000 with traditional minting

## Security

✅ Cryptographic proof verification
✅ One claim per address
✅ Reentrancy protection
✅ Max supply protection
✅ Owner-only root setting

## Next Steps

See `MERKLE_AIRDROP_GUIDE.md` for complete documentation including:
- CSV import
- Frontend integration
- Troubleshooting
- Advanced features
