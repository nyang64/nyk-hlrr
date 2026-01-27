// Enable/disable emergency mode (owner only)
// Usage: npx hardhat run scripts/emergency.js --network <network-name>
//
// Configure these values before running:

const hre = require("hardhat");
const { ethers } = require("hardhat");

// ====== CONFIGURATION ======
const TOKEN_ADDRESS = "0x..."; // Replace with your deployed contract address
const ENABLE_EMERGENCY = true; // true to enable, false to disable
// ===========================

async function main() {
  console.log("🚨 Managing Emergency Mode...\n");

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
    console.error("❌ Error: Only owner can manage emergency mode!");
    console.error(`   Owner: ${owner}`);
    console.error(`   Your address: ${signer.address}`);
    console.log("");
    process.exit(1);
  }

  // Get current status
  const currentEmergency = await token.emergencyMode();
  
  console.log("Current Status:");
  console.log("  Emergency Mode:", currentEmergency);
  console.log("");

  // Check if change is needed
  if (currentEmergency === ENABLE_EMERGENCY) {
    console.log(`ℹ️  Emergency mode is already ${ENABLE_EMERGENCY ? 'enabled' : 'disabled'}.`);
    console.log("   No action needed.");
    console.log("");
    process.exit(0);
  }

  // Warn about emergency mode implications
  if (ENABLE_EMERGENCY) {
    console.log("⚠️  WARNING: Enabling emergency mode will:");
    console.log("   - Block all new stakes");
    console.log("   - Block all reward claims");
    console.log("   - Allow users to emergency unstake (forfeit rewards)");
    console.log("   - Bypass lock periods for unstaking");
    console.log("");
  }

  // Execute emergency mode change
  console.log(`🔄 ${ENABLE_EMERGENCY ? 'Enabling' : 'Disabling'} emergency mode...`);
  const tx = await token.enableEmergency(ENABLE_EMERGENCY);
  console.log("  Transaction hash:", tx.hash);
  
  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("  ✅ Confirmed in block:", receipt.blockNumber);
  console.log("");

  // Verify change
  const newStatus = await token.emergencyMode();
  console.log("After Change:");
  console.log("  Emergency Mode:", newStatus);
  console.log("");

  if (newStatus === ENABLE_EMERGENCY) {
    console.log("✨ Status Updated Successfully!");
    console.log(`   Emergency mode is now ${ENABLE_EMERGENCY ? 'ENABLED' : 'DISABLED'}`);
    
    if (ENABLE_EMERGENCY) {
      console.log("");
      console.log("🚨 Emergency Mode Active:");
      console.log("   Users can call emergencyUnstake() to withdraw principal");
      console.log("   All rewards will be forfeited");
      console.log("   Lock periods are bypassed");
    } else {
      console.log("");
      console.log("✅ Normal Operation Restored:");
      console.log("   Users can stake, claim, and unstake normally");
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
