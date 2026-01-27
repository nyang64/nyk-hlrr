# HashLierre Operational Scripts - Hardhat v2 + ethers v5

All scripts rewritten for **Hardhat v2 + ethers v5** compatibility with **.cjs extension** for your local environment.

## 📦 Scripts Overview

### Deployment & Setup
1. **deploy.cjs** - Deploy contract and mint initial supply
2. **mint.cjs** - Mint additional tokens (owner only)

### Staking Operations  
3. **stake.cjs** - Stake tokens to earn rewards
4. **claim.cjs** - Claim staking rewards (auto-compounds)
5. **unstake.cjs** - Unstake tokens after lock period

### Admin Operations (Owner Only)
6. **setAPR.cjs** - Change staking APR
7. **pause.cjs** - Pause/unpause staking
8. **emergency.cjs** - Enable/disable emergency mode

### Airdrop Operations
9. **generateMerkleTree.cjs** - Generate airdrop merkle tree
10. **setMerkleRoot.cjs** - Set merkle root on contract

---

## 🚀 Quick Start

### 1. Test Deploy & Mint Locally

```bash
# Terminal 1: Start local Hardhat node
npx hardhat node

# Terminal 2: Deploy and mint
npx hardhat run scripts/deploy.cjs --network localhost
```

**Expected Output:**
```
🚀 Deploying HashLierre Contract...

Deploying from account: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Account balance: 10000.0 ETH

📜 Deploying HashLierre...
✅ HashLierre deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3

💰 Minting 10000000 tokens...
✅ Minted 10000000 HLRR with tag "genesis"
Total Supply: 10000000.0 HLRR

📋 Deployment Summary:
   Contract Address: 0x5FbDB2315678afecb367f032d93F642f64180aa3
   Network: localhost
   Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
   Decimals: 8

✨ Deployment Complete!
```

### 2. Configure Script for Next Operation

Edit `scripts/mint.cjs`:
```javascript
const TOKEN_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // From deploy output
const AMOUNT = 1000000; // 1M tokens
```

Run:
```bash
npx hardhat run scripts/mint.cjs --network localhost
```

---

## ⚙️ Configuration

### Environment Setup (.env)

```bash
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
SEPOLIA_PRIVATE_KEY=your_private_key_here

BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
BASE_PRIVATE_KEY=your_private_key_here

BNB_RPC_URL=https://bsc-dataseed.binance.org/
BNB_PRIVATE_KEY=your_private_key_here
```

### Hardhat Config (hardhat.config.js)

```javascript
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

module.exports = {
  solidity: "0.8.28",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
    },
    base: {
      url: process.env.BASE_RPC_URL || "",
      accounts: process.env.BASE_PRIVATE_KEY ? [process.env.BASE_PRIVATE_KEY] : [],
    },
    bnb: {
      url: process.env.BNB_RPC_URL || "",
      accounts: process.env.BNB_PRIVATE_KEY ? [process.env.BNB_PRIVATE_KEY] : [],
    },
  },
};
```

---

## 📖 Script Details

### deploy.cjs
**Purpose:** Deploy contract and mint initial supply  
**Configuration:**
```javascript
const TAG = "genesis";
const INITIAL_MINT_AMOUNT = 10000000; // 10M tokens
```

**Usage:**
```bash
npx hardhat run scripts/deploy.cjs --network base
```

---

### mint.cjs
**Purpose:** Mint additional tokens (owner only)  
**Configuration:**
```javascript
const TOKEN_ADDRESS = "0x...";
const RECIPIENT_ADDRESS = ""; // Empty = deployer
const AMOUNT = 1000000;
const TAG = "mint";
```

**Usage:**
```bash
npx hardhat run scripts/mint.cjs --network base
```

---

### stake.cjs
**Purpose:** Stake tokens to earn rewards  
**Configuration:**
```javascript
const TOKEN_ADDRESS = "0x...";
const STAKE_AMOUNT = 1000;
```

**Features:**
- Auto-approves tokens
- Shows lock period (14 days)
- Displays pending rewards

**Usage:**
```bash
npx hardhat run scripts/stake.cjs --network base
```

---

### claim.cjs
**Purpose:** Claim staking rewards  
**Configuration:**
```javascript
const TOKEN_ADDRESS = "0x...";
```

**Features:**
- Auto-compounds rewards into stake
- Shows updated stake amount
- Checks emergency mode

**Usage:**
```bash
npx hardhat run scripts/claim.cjs --network base
```

---

### unstake.cjs
**Purpose:** Unstake tokens after lock period  
**Configuration:**
```javascript
const TOKEN_ADDRESS = "0x...";
const UNSTAKE_AMOUNT = 500;
```

**Requirements:**
- 14 days must pass from initial stake
- OR emergency mode enabled

**Usage:**
```bash
npx hardhat run scripts/unstake.cjs --network base
```

---

### setAPR.cjs (Owner Only)
**Purpose:** Change staking APR  
**Configuration:**
```javascript
const TOKEN_ADDRESS = "0x...";
const NEW_APR = 1000; // 10%
```

**Limits:**
- Max APR: 12% (1200 basis points)
- Min interval: 365 days between changes

**Usage:**
```bash
npx hardhat run scripts/setAPR.cjs --network base
```

---

### pause.cjs (Owner Only)
**Purpose:** Pause/unpause new stakes  
**Configuration:**
```javascript
const TOKEN_ADDRESS = "0x...";
const PAUSE = true; // true = pause, false = unpause
```

**Effects:**
- Blocks new stakes when paused
- Claims and unstakes still work

**Usage:**
```bash
npx hardhat run scripts/pause.cjs --network base
```

---

### emergency.cjs (Owner Only)
**Purpose:** Enable/disable emergency mode  
**Configuration:**
```javascript
const TOKEN_ADDRESS = "0x...";
const ENABLE_EMERGENCY = true;
```

**Effects When Enabled:**
- Blocks stakes and claims
- Allows emergency unstake (forfeit rewards)
- Bypasses lock periods

**Usage:**
```bash
npx hardhat run scripts/emergency.cjs --network base
```

---

### generateMerkleTree.cjs
**Purpose:** Generate merkle tree for airdrops  
**Configuration:** Edit airdropList in script:
```javascript
const airdropList = [
  { address: '0x...', amount: ethers.utils.parseUnits('1000', 8).toString() },
  // Add more...
];
```

**Output:** Creates `airdrop-merkle-data.json`

**Usage:**
```bash
npx hardhat run scripts/generateMerkleTree.cjs
```

---

### setMerkleRoot.cjs (Owner Only)
**Purpose:** Set merkle root for airdrop claims  
**Configuration:**
```javascript
const TOKEN_ADDRESS = "0x...";
```

**Prerequisites:** Run `generateMerkleTree.cjs` first

**Usage:**
```bash
npx hardhat run scripts/setMerkleRoot.cjs --network base
```

---

## 🔑 Important Notes

### ⚠️ Token Uses 8 Decimals (Not 18!)

```javascript
// ✅ CORRECT
ethers.utils.parseUnits('1000', 8)

// ❌ WRONG
ethers.utils.parseUnits('1000', 18)
```

### Contract Address Configuration

After deployment, update `TOKEN_ADDRESS` in each script:
```javascript
const TOKEN_ADDRESS = "0x..."; // Your deployed contract address
```

---

## 📋 Common Workflows

### Initial Deployment (BASE)
```bash
# 1. Deploy
npx hardhat run scripts/deploy.cjs --network base

# 2. Copy contract address, update all scripts

# 3. (Optional) Setup airdrop
npx hardhat run scripts/generateMerkleTree.cjs
npx hardhat run scripts/setMerkleRoot.cjs --network base

# 4. Verify (optional)
npx hardhat verify --network base <CONTRACT_ADDRESS>
```

### User Staking Flow
```bash
# Stake
npx hardhat run scripts/stake.cjs --network base

# Wait for rewards...

# Claim (auto-compounds)
npx hardhat run scripts/claim.cjs --network base

# After 14 days, unstake
npx hardhat run scripts/unstake.cjs --network base
```

---

## 💰 Gas Estimates (BASE at 0.058 gwei)

| Operation | Gas Cost |
|-----------|----------|
| Deploy | ~$0.57 |
| Mint | ~$0.01 |
| Stake | ~$0.02 |
| Claim | ~$0.015 |
| Unstake | ~$0.015 |
| Set APR | ~$0.01 |
| Pause | ~$0.008 |
| Emergency | ~$0.008 |

---

## 🐛 Troubleshooting

### "Only owner can..." Error
- Use the deployer account
- Check: `await token.owner()`

### "APR change too soon"
- Wait 365 days between changes
- Check: `await token.lastAPRChange()`

### "Stake locked"
- Wait 14 days from initial stake
- Check: `await token.getTimeUntilUnstake(address)`

### "Insufficient balance"
- Check: `await token.balanceOf(address)`
- Need unstaked tokens to stake

---

## ✅ Script Summary

| Script | Owner Only | Network | Purpose |
|--------|------------|---------|---------|
| deploy.cjs | ✅ | ✅ | Deploy contract |
| mint.cjs | ✅ | ✅ | Mint tokens |
| stake.cjs | ❌ | ✅ | Stake tokens |
| claim.cjs | ❌ | ✅ | Claim rewards |
| unstake.cjs | ❌ | ✅ | Unstake tokens |
| setAPR.cjs | ✅ | ✅ | Change APR |
| pause.cjs | ✅ | ✅ | Pause staking |
| emergency.cjs | ✅ | ✅ | Emergency mode |
| generateMerkleTree.cjs | ❌ | ❌ | Generate merkle |
| setMerkleRoot.cjs | ✅ | ✅ | Set merkle root |

---

**All scripts use .cjs extension and are production-ready with Hardhat v2 + ethers v5!** 🎉
