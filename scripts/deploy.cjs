// Deploy HashLierre contract using Hardhat + ethers v5
// Usage: npx hardhat run scripts/deploy.cjs --network <network-name>

const hre = require("hardhat");
const { ethers } = require("hardhat");

const TAG = "genesis";
const INITIAL_MINT_AMOUNT = 10000000; // 10 million tokens

async function main() {
  console.log("🚀 Deploying HashLierre Contract...\n");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying from account:", deployer.address);
  
  const balance = await deployer.getBalance();
  console.log("Account balance:", ethers.utils.formatEther(balance), "ETH\n");

  // Deploy contract
  console.log("📜 Deploying HashLierre...");
  const HashLierre = await ethers.getContractFactory("HashLierre");
  const token = await HashLierre.deploy();
  
  // Wait for deployment (ethers v5 style)
  await token.deployed();
  
  console.log("✅ HashLierre deployed to:", token.address);
  console.log("");

  // Wait for confirmations on real networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("⏳ Waiting for block confirmations...");
    await token.deployTransaction.wait(5);
    console.log("✅ Confirmed!\n");
  }

  // Mint initial supply if amount > 0
  if (INITIAL_MINT_AMOUNT > 0) {
    console.log(`💰 Minting ${INITIAL_MINT_AMOUNT} tokens...`);
    
    // Note: HashLierre uses 8 decimals (not 18!)
    const decimals = await token.decimals();
    const amount = ethers.BigNumber.from(INITIAL_MINT_AMOUNT).mul(
      ethers.BigNumber.from(10).pow(decimals)
    );
    
    const mintTx = await token.mint(deployer.address, amount, TAG);
    await mintTx.wait();
    
    console.log(`✅ Minted ${INITIAL_MINT_AMOUNT} HLRR with tag "${TAG}"`);
    
    const totalSupply = await token.totalSupply();
    console.log("Total Supply:", ethers.utils.formatUnits(totalSupply, decimals), "HLRR\n");
  }

  // Print deployment summary
  console.log("📋 Deployment Summary:");
  console.log("   Contract Address:", token.address);
  console.log("   Network:", hre.network.name);
  console.log("   Deployer:", deployer.address);
  console.log("   Decimals:", await token.decimals());
  console.log("   Symbol:", await token.symbol());
  console.log("   Name:", await token.name());
  console.log("");

  // Print verification command for non-local networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("🔍 Verify contract on block explorer:");
    console.log(`   npx hardhat verify --network ${hre.network.name} ${token.address}`);
    console.log("");
  }

  console.log("✨ Deployment Complete!\n");
  
  return token.address;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
