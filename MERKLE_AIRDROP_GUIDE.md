# Merkle Airdrop Implementation

## Overview

The HashLierre contract now supports efficient airdrops using Merkle Trees. This allows distributing tokens to thousands of recipients with minimal gas costs.

## How It Works

### Traditional Airdrop (Expensive ❌)
- Owner calls `mint()` for each recipient
- 1,000 recipients = 50,000,000 gas = ~1 ETH cost to owner

### Merkle Airdrop (Efficient ✅)
- Owner calls `setMerkleRoot()` once = ~45,000 gas = ~$3 cost to owner
- Users claim their own tokens = ~65,000 gas each (they pay)
- **Scales to millions of recipients!**

## Setup Instructions

### 1. Install Dependencies

```bash
npm install merkletreejs keccak256
```

### 2. Prepare Airdrop List

Create your recipient list in the script or load from CSV:

**Option A: Edit script directly**
```javascript
// In scripts/generateMerkleTree.js
const airdropList = [
  { address: '0x123...', amount: ethers.utils.parseUnits('1000', 8).toString() },
  { address: '0x456...', amount: ethers.utils.parseUnits('500', 8).toString() },
  // ... more recipients
];
```

**Option B: Load from CSV**
Create `airdrop-list.csv`:
```csv
address,amount
0x1234567890123456789012345678901234567890,1000
0x2345678901234567890123456789012345678901,500
0x3456789012345678901234567890123456789012,250
```

Then modify the script to use CSV loader (see `loadFromCSV` function).

### 3. Generate Merkle Tree

```bash
npx hardhat run scripts/generateMerkleTree.js
```

This creates `airdrop-merkle-data.json` containing:
- Merkle root (to set on contract)
- Proof for each recipient
- Total statistics

### 4. Set Merkle Root on Contract

```javascript
const merkleData = require('./airdrop-merkle-data.json');

// Call contract
await token.setMerkleRoot(merkleData.merkleRoot);
```

Or via Hardhat console:
```bash
npx hardhat console --network sepolia

> const token = await ethers.getContractAt("HashLierre", "YOUR_CONTRACT_ADDRESS")
> await token.setMerkleRoot("0x...")
```

### 5. Users Claim Their Tokens

Share `airdrop-merkle-data.json` with your frontend or users can look up their proof.

**Frontend Example:**
```javascript
// Load the merkle data
const merkleData = await fetch('/airdrop-merkle-data.json').then(r => r.json());

// Find user's allocation
const userAirdrop = merkleData.recipients.find(
  r => r.address.toLowerCase() === userAddress.toLowerCase()
);

if (userAirdrop) {
  // User can claim
  await token.claimAirdrop(userAirdrop.amount, userAirdrop.proof);
} else {
  console.log('No airdrop allocation for this address');
}
```

## Contract Functions

### Owner Functions

#### `setMerkleRoot(bytes32 _merkleRoot)`
Sets the merkle root for airdrop verification.
- **Access**: Owner only
- **Gas**: ~45,000
- **Emits**: `MerkleRootSet(bytes32 merkleRoot)`

### User Functions

#### `claimAirdrop(uint256 amount, bytes32[] calldata merkleProof)`
Claims airdrop tokens using merkle proof.
- **Access**: Anyone with valid proof
- **Gas**: ~65,000 first claim, ~48,000 subsequent
- **Emits**: `AirdropClaimed(address user, uint256 amount)`
- **Reverts if**:
  - Merkle root not set
  - Already claimed
  - Invalid proof
  - Would exceed max supply

#### `hasClaimedAirdrop(address user) returns (bool)`
Check if an address has claimed their airdrop.
- **Access**: Public view (free)

## Security Features

✅ **Proof Verification**: Users can only claim their allocated amount
✅ **One Claim Per Address**: Cannot claim twice
✅ **Max Supply Protection**: Cannot mint beyond 50M tokens
✅ **Reentrancy Protection**: Uses `nonReentrant` modifier
✅ **Owner Control**: Only owner can set merkle root

## Gas Costs Comparison

| Method | Owner Pays | Users Pay | Total (1000 users) |
|--------|-----------|-----------|-------------------|
| Traditional mint() | 50M gas | 0 | ~1 ETH |
| Merkle Airdrop | 45K gas | 65K each | ~$3 |

**Savings: ~99.9%** 🎉

## Testing

Run the test suite:
```bash
npx hardhat test
```

Merkle airdrop tests include:
- ✅ Owner can set merkle root
- ✅ Valid proof claims work
- ✅ Invalid proofs rejected
- ✅ Cannot claim twice
- ✅ Multiple users can claim
- ✅ Max supply protection
- ✅ Cannot claim without merkle root set

## Example Workflow

### Step-by-Step Airdrop

1. **Prepare list** (1-2 hours)
   - Compile recipient addresses and amounts
   - Validate addresses
   - Total should not exceed remaining supply

2. **Generate tree** (1 minute)
   ```bash
   npx hardhat run scripts/generateMerkleTree.js
   ```

3. **Set root on contract** (1 transaction)
   ```javascript
   await token.setMerkleRoot(merkleRoot);
   ```
   Cost: ~$3 on Ethereum mainnet

4. **Distribute data** (same day)
   - Upload `airdrop-merkle-data.json` to your website
   - Or integrate into claim UI
   - Or send individual proofs to recipients

5. **Users claim** (they pay gas)
   - Users visit claim page
   - Connect wallet
   - Click "Claim Airdrop"
   - They pay ~$15-30 gas (at 20 gwei)

## Advanced: CSV Import

To use CSV file:

```javascript
// In your deployment/setup script
const { loadFromCSV } = require('./scripts/generateMerkleTree');

// Load from CSV
const airdropList = await loadFromCSV('./airdrop-list.csv');

// Generate tree with loaded data
// ... rest of generation code
```

## Troubleshooting

**"Invalid proof" error**
- Make sure address and amount match exactly what's in merkle tree
- Proof must be for the address calling `claimAirdrop()`
- Check that merkle root was set correctly

**"Already claimed" error**
- Each address can only claim once
- Check with `hasClaimedAirdrop(address)`

**"Airdrop not initialized" error**
- Owner must call `setMerkleRoot()` first
- Verify merkle root is not zero bytes

**"Exceeds max supply" error**
- Total supply would exceed 50M tokens
- Reduce airdrop amounts or wait for tokens to be burned

## Events

Monitor these events for tracking:

```solidity
event MerkleRootSet(bytes32 indexed merkleRoot);
event AirdropClaimed(address indexed user, uint256 amount);
```

Query events:
```javascript
// Get all claims
const claimEvents = await token.queryFilter(
  token.filters.AirdropClaimed()
);

console.log(`Total claims: ${claimEvents.length}`);
```

## Notes

- Merkle root can be updated by owner (for multiple airdrop rounds)
- Each address can claim once per merkle root update
- If you update merkle root, previous unclaimed allocations are lost
- Consider announcing airdrop end date to create urgency
- Frontend should cache merkle data to avoid repeated downloads

## Resources

- [Merkle Trees Explained](https://en.wikipedia.org/wiki/Merkle_tree)
- [OpenZeppelin MerkleProof](https://docs.openzeppelin.com/contracts/4.x/api/utils#MerkleProof)
- [merkletreejs Documentation](https://github.com/merkletreejs/merkletreejs)
