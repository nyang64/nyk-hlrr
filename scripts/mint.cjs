// Mint tokens to a specified address
// Usage: npx hardhat run scripts/mint.cjs --network <network-name>
//
// Configure these values before running:

const hre = require("hardhat");
const { ethers } = require("hardhat");

// ====== CONFIGURATION ======
const TOKEN_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3"; // Replace with your deployed contract address
const RECIPIENT_ADDRESS = ""; // Leave empty to mint to deployer, or specify address
const AMOUNT = 1000000; // Amount in tokens (will be multiplied by decimals)
const TAG = "mint"; // Tag for tracking this mint operation
// ===========================

async function main() {
  console.log("💰 Minting HLRR Tokens...\n");

  if (TOKEN_ADDRESS === "0x...") {
    console.error("❌ Error: Please set TOKEN_ADDRESS in the script!");
    process.exit(1);
  }

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Minting from account:", signer.address);
  console.log("");

  // Connect to contract
  const token = await ethers.getContractAt("HashLierre", TOKEN_ADDRESS);
  console.log("Contract Address:", token.address);
  console.log("");

  // Determine recipient
  const recipient = RECIPIENT_ADDRESS || signer.address;
  console.log("Recipient:", recipient);

  // Get decimals
  const decimals = await token.decimals();
  console.log("Token decimals:", decimals.toString());

  // Calculate amount in base units
  const amount = ethers.BigNumber.from(AMOUNT).mul(
    ethers.BigNumber.from(10).pow(decimals)
  );

  console.log("Amount to mint:", AMOUNT, "HLRR");
  console.log("Tag:", TAG);
  console.log("");

  // Check current supply before mint
  const supplyBefore = await token.totalSupply();
  const balanceBefore = await token.balanceOf(recipient);
  
  console.log("Before Mint:");
  console.log("  Total Supply:", ethers.utils.formatUnits(supplyBefore, decimals), "HLRR");
  console.log("  Recipient Balance:", ethers.utils.formatUnits(balanceBefore, decimals), "HLRR");
  console.log("");

  // Execute mint
  console.log("🔄 Executing mint transaction...");
  const tx = await token.mint(recipient, amount, TAG);
  console.log("  Transaction hash:", tx.hash);
  
  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("  ✅ Confirmed in block:", receipt.blockNumber);
  console.log("");

  // Check supply after mint
  const supplyAfter = await token.totalSupply();
  const balanceAfter = await token.balanceOf(recipient);
  
  console.log("After Mint:");
  console.log("  Total Supply:", ethers.utils.formatUnits(supplyAfter, decimals), "HLRR");
  console.log("  Recipient Balance:", ethers.utils.formatUnits(balanceAfter, decimals), "HLRR");
  console.log("");

  console.log("✨ Mint Complete!");
  console.log(`   Minted ${AMOUNT} HLRR to ${recipient}`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
