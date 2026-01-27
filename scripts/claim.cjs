// Claim staking rewards
// Usage: npx hardhat run scripts/claim.cjs --network <network-name>
//
// Configure these values before running:

const hre = require("hardhat");
const { ethers } = require("hardhat");

// ====== CONFIGURATION ======
const TOKEN_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3"; // Replace with your deployed contract address
// ===========================

async function main() {
  console.log("💎 Claiming Staking Rewards...\n");

  if (TOKEN_ADDRESS === "0x...") {
    console.error("❌ Error: Please set TOKEN_ADDRESS in the script!");
    process.exit(1);
  }

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Claiming for account:", signer.address);
  console.log("");

  // Connect to contract
  const token = await ethers.getContractAt("HashLierre", TOKEN_ADDRESS);
  console.log("Contract Address:", token.address);
  console.log("");

  // Get decimals
  const decimals = await token.decimals();

  // Check pending rewards
  const pending = await token.pendingReward(signer.address);
  const stakeInfo = await token.stakes(signer.address);

  console.log("Current Status:");
  console.log("  Staked Amount:", ethers.utils.formatUnits(stakeInfo.amount, decimals), "HLRR");
  console.log("  Pending Rewards:", ethers.utils.formatUnits(pending, decimals), "HLRR");
  console.log("");

  // Check if there are rewards to claim
  if (pending.eq(0)) {
    console.log("ℹ️  No rewards to claim yet.");
    console.log("   Stake some tokens and wait for rewards to accrue.");
    console.log("");
    process.exit(0);
  }

  // Check if emergency mode is enabled
  const emergencyMode = await token.emergencyMode();
  if (emergencyMode) {
    console.error("❌ Error: Contract is in emergency mode!");
    console.error("   Reward claims are disabled.");
    console.error("   Use emergencyUnstake() to withdraw principal only.");
    console.log("");
    process.exit(1);
  }

  // Execute claim
  console.log("🔄 Claiming rewards...");
  const tx = await token.claimReward();
  console.log("  Transaction hash:", tx.hash);
  
  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("  ✅ Confirmed in block:", receipt.blockNumber);
  console.log("");

  // Check status after claim
  const stakeInfoAfter = await token.stakes(signer.address);
  const pendingAfter = await token.pendingReward(signer.address);

  console.log("After Claim:");
  console.log("  Staked Amount:", ethers.utils.formatUnits(stakeInfoAfter.amount, decimals), "HLRR");
  console.log("  Pending Rewards:", ethers.utils.formatUnits(pendingAfter, decimals), "HLRR");
  console.log("");

  console.log("✨ Claim Complete!");
  console.log(`   Claimed ${ethers.utils.formatUnits(pending, decimals)} HLRR`);
  console.log(`   Rewards auto-compounded into stake`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
