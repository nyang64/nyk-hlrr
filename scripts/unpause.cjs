// Pause/unpause staking (owner only)
// Usage: npx hardhat run scripts/pause.cjs --network <network-name>
//
// Configure these values before running:

const hre = require("hardhat");
const { ethers } = require("hardhat");

// ====== CONFIGURATION ======
const TOKEN_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3"; // Replace with your deployed contract address
const PAUSE = false; // true to pause, false to unpause
// ===========================

async function main() {
  console.log("🔒 Managing Staking Pause...\n");

  if (TOKEN_ADDRESS === "0x...") {
    console.error("❌ Error: Please set TOKEN_ADDRESS in the script!");
    process.exit(1);
  }

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Managing from account:", signer.address);
  console.log("");

  // Connect to contract
  const token = await ethers.getContractAt("HashLierre", TOKEN_ADDRESS);
  console.log("Contract Address:", token.address);
  console.log("");

  // Check ownership
  const owner = await token.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error("❌ Error: Only owner can pause/unpause staking!");
    console.error(`   Owner: ${owner}`);
    console.error(`   Your address: ${signer.address}`);
    console.log("");
    process.exit(1);
  }

  // Get current status
  const currentlyPaused = await token.stakingPaused();
  
  console.log("Current Status:");
  console.log("  Staking Paused:", currentlyPaused);
  console.log("");

  // Check if change is needed
  if (currentlyPaused === PAUSE) {
    console.log(`ℹ️  Staking is already ${PAUSE ? 'paused' : 'unpaused'}.`);
    console.log("   No action needed.");
    console.log("");
    process.exit(0);
  }

  // Execute pause/unpause
  console.log(`🔄 ${PAUSE ? 'Pausing' : 'Unpausing'} staking...`);
  const tx = await token.pauseStaking(PAUSE);
  console.log("  Transaction hash:", tx.hash);
  
  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("  ✅ Confirmed in block:", receipt.blockNumber);
  console.log("");

  // Verify change
  const newStatus = await token.stakingPaused();
  console.log("After Change:");
  console.log("  Staking Paused:", newStatus);
  console.log("");

  if (newStatus === PAUSE) {
    console.log("✨ Status Updated Successfully!");
    console.log(`   Staking is now ${PAUSE ? 'PAUSED' : 'ACTIVE'}`);
    
    if (PAUSE) {
      console.log("");
      console.log("⚠️  Note: New stakes are blocked");
      console.log("   Existing stakes can still:");
      console.log("   - Claim rewards");
      console.log("   - Unstake (after lock period)");
    }
  } else {
    console.error("❌ Warning: Status verification failed!");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
