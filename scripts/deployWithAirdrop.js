const { ethers } = require('hardhat');
const merkleData = require('../airdrop-merkle-data.json');

/**
 * Deploy Contract and Set Merkle Root
 * 
 * Use this for actual deployment to testnet/mainnet
 */

async function main() {
  console.log('🚀 Deploying HashLierre with Airdrop...\n');

  const [deployer] = await ethers.getSigners();
  console.log('Deploying from:', deployer.address);
  console.log('Account balance:', ethers.utils.formatEther(await deployer.getBalance()), 'ETH\n');

  // Deploy contract
  console.log('📜 Deploying HashLierre...');
  const HashLierre = await ethers.getContractFactory('HashLierre');
  const token = await HashLierre.deploy();
  await token.deployed();

  console.log('✅ HashLierre deployed to:', token.address);
  console.log('');

  // Wait for a few confirmations
  console.log('⏳ Waiting for confirmations...');
  await token.deployTransaction.wait(3);
  console.log('✅ Confirmed!\n');

  // Set merkle root (if merkle data exists)
  try {
    console.log('📝 Setting merkle root...');
    console.log('   Root:', merkleData.merkleRoot);
    console.log('   Recipients:', merkleData.totalRecipients);
    console.log('   Total Amount:', merkleData.totalAmountFormatted, 'HLRR');

    const tx = await token.setMerkleRoot(merkleData.merkleRoot);
    await tx.wait();

    console.log('✅ Merkle root set!\n');

    // Verify
    const root = await token.merkleRoot();
    console.log('🔍 Verified merkle root:', root === merkleData.merkleRoot ? '✅' : '❌');
  } catch (error) {
    console.log('⚠️  No merkle data found. Run generateMerkleTree.js first.');
    console.log('   Or set merkle root later with: token.setMerkleRoot(root)\n');
  }

  // Print summary
  console.log('📋 Deployment Summary:');
  console.log('   Contract:', token.address);
  console.log('   Network:', (await ethers.provider.getNetwork()).name);
  console.log('   Deployer:', deployer.address);
  console.log('');

  console.log('📖 Next Steps:');
  console.log('   1. Verify contract on block explorer');
  console.log('   2. Share airdrop-merkle-data.json with frontend');
  console.log('   3. Announce airdrop to community');
  console.log('   4. Users can claim via claimAirdrop(amount, proof)');
  console.log('');

  // If on a real network, print verification command
  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    console.log('🔍 Verify on Etherscan:');
    console.log(`   npx hardhat verify --network ${network.name} ${token.address}`);
    console.log('');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
