// Set Merkle Root for airdrop (owner only)
// Usage: npx hardhat run scripts/setMerkleRoot.js --network <network-name>
//
// Prerequisites: Run generateMerkleTree.js first to create airdrop-merkle-data.json

const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ====== CONFIGURATION ======
const TOKEN_ADDRESS = "0x..."; // Replace with your deployed contract address
// ===========================

async function main() {
  console.log("🌳 Setting Merkle Root for Airdrop...\n");

  if (TOKEN_ADDRESS === "0x...") {
    console.error("❌ Error: Please set TOKEN_ADDRESS in the script!");
    process.exit(1);
  }

  // Load merkle data
  const merkleDataPath = path.join(__dirname, '../airdrop-merkle-data.json');
  if (!fs.existsSync(merkleDataPath)) {
    console.error("❌ Error: airdrop-merkle-data.json not found!");
    console.error("   Run: npx hardhat run scripts/generateMerkleTree.js");
    console.log("");
    process.exit(1);
  }

  const merkleData = JSON.parse(fs.readFileSync(merkleDataPath, 'utf8'));
  
  console.log("📋 Airdrop Data Loaded:");
  console.log("   Merkle Root:", merkleData.merkleRoot);
  console.log("   Recipients:", merkleData.totalRecipients);
  console.log("   Total Amount:", merkleData.totalAmountFormatted, "HLRR");
  console.log("");

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Setting from account:", signer.address);
  console.log("");

  // Connect to contract
  const token = await ethers.getContractAt("HashLierre", TOKEN_ADDRESS);
  console.log("Contract Address:", token.address);
  console.log("");

  // Check ownership
  const owner = await token.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error("❌ Error: Only owner can set merkle root!");
    console.error(`   Owner: ${owner}`);
    console.error(`   Your address: ${signer.address}`);
    console.log("");
    process.exit(1);
  }

  // Check current merkle root
  const currentRoot = await token.merkleRoot();
  console.log("Current merkle root:", currentRoot);
  
  if (currentRoot !== ethers.constants.HashZero && currentRoot.toLowerCase() === merkleData.merkleRoot.toLowerCase()) {
    console.log("ℹ️  Merkle root is already set to this value.");
    console.log("   No action needed.");
    console.log("");
    process.exit(0);
  }

  if (currentRoot !== ethers.constants.HashZero) {
    console.log("⚠️  Warning: Overwriting existing merkle root!");
    console.log("   Old root:", currentRoot);
    console.log("   New root:", merkleData.merkleRoot);
    console.log("");
  }

  // Set merkle root
  console.log("🔄 Setting merkle root...");
  const tx = await token.setMerkleRoot(merkleData.merkleRoot);
  console.log("  Transaction hash:", tx.hash);
  
  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("  ✅ Confirmed in block:", receipt.blockNumber);
  console.log("");

  // Verify
  const newRoot = await token.merkleRoot();
  console.log("After Setting:");
  console.log("  Merkle Root:", newRoot);
  console.log("");

  if (newRoot.toLowerCase() === merkleData.merkleRoot.toLowerCase()) {
    console.log("✨ Merkle Root Set Successfully!");
    console.log("");
    console.log("📖 Next Steps:");
    console.log("   1. Share airdrop-merkle-data.json with your frontend");
    console.log("   2. Announce airdrop to community");
    console.log("   3. Users can claim via claimAirdrop(amount, proof)");
  } else {
    console.error("❌ Warning: Merkle root verification failed!");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
