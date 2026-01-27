// Set APR (owner only)
// Usage: npx hardhat run scripts/setAPR.cjs --network <network-name>
//
// Configure these values before running:

const hre = require("hardhat");
const { ethers } = require("hardhat");

// ====== CONFIGURATION ======
const TOKEN_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3"; // Replace with your deployed contract address
const NEW_APR = 1000; // New APR in basis points (1000 = 10%)
// ===========================

async function main() {
  console.log("⚙️  Setting APR...\n");

  if (TOKEN_ADDRESS === "0x...") {
    console.error("❌ Error: Please set TOKEN_ADDRESS in the script!");
    process.exit(1);
  }

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Setting APR from account:", signer.address);
  console.log("");

  // Connect to contract
  const token = await ethers.getContractAt("HashLierre", TOKEN_ADDRESS);
  console.log("Contract Address:", token.address);
  console.log("");

  // Check ownership
  const owner = await token.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error("❌ Error: Only owner can set APR!");
    console.error(`   Owner: ${owner}`);
    console.error(`   Your address: ${signer.address}`);
    console.log("");
    process.exit(1);
  }

  // Get current APR
  const currentAPR = await token.apr();
  const maxAPR = await token.MAX_APR();
  const minInterval = await token.MIN_APR_CHANGE_INTERVAL();
  const lastChange = await token.lastAPRChange();

  console.log("Current APR Settings:");
  console.log("  Current APR:", currentAPR.toString(), "basis points", `(${currentAPR / 100}%)`);
  console.log("  Max APR:", maxAPR.toString(), "basis points", `(${maxAPR / 100}%)`);
  console.log("  Min Change Interval:", minInterval.toString(), "seconds", `(${minInterval / 86400} days)`);
  console.log("");

  // Check if new APR is valid
  if (NEW_APR > maxAPR) {
    console.error("❌ Error: APR exceeds maximum!");
    console.error(`   Max allowed: ${maxAPR} (${maxAPR / 100}%)`);
    console.error(`   Requested: ${NEW_APR} (${NEW_APR / 100}%)`);
    console.log("");
    process.exit(1);
  }

  // Check if enough time has passed since last change
  const now = Math.floor(Date.now() / 1000);
  const nextChangeTime = lastChange.add(minInterval);
  
  if (now < nextChangeTime.toNumber()) {
    const remaining = nextChangeTime.toNumber() - now;
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    
    console.error("❌ Error: APR changed too recently!");
    console.error(`   Time until next change allowed: ${days} days, ${hours} hours`);
    console.log("");
    process.exit(1);
  }

  // Show what will change
  console.log("Proposed Change:");
  console.log("  Old APR:", currentAPR.toString(), `(${currentAPR / 100}%)`);
  console.log("  New APR:", NEW_APR, `(${NEW_APR / 100}%)`);
  console.log("");

  // Execute APR change
  console.log("🔄 Setting new APR...");
  const tx = await token.setAPR(NEW_APR);
  console.log("  Transaction hash:", tx.hash);
  
  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("  ✅ Confirmed in block:", receipt.blockNumber);
  console.log("");

  // Verify change
  const newAPR = await token.apr();
  console.log("After Change:");
  console.log("  Current APR:", newAPR.toString(), "basis points", `(${newAPR / 100}%)`);
  console.log("");

  if (newAPR.toNumber() === NEW_APR) {
    console.log("✨ APR Updated Successfully!");
    console.log(`   New APR: ${NEW_APR / 100}%`);
  } else {
    console.error("❌ Warning: APR verification failed!");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
