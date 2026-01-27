const { ethers } = require('hardhat');
const { generateMerkleTree } = require('./generateMerkleTree');

/**
 * Test Airdrop Locally
 * 
 * This script:
 * 1. Deploys the contract
 * 2. Generates merkle tree
 * 3. Sets merkle root
 * 4. Simulates claims
 */

async function main() {
  console.log('🚀 Testing Merkle Airdrop Locally...\n');

  // Get signers
  const [owner, user1, user2, user3] = await ethers.getSigners();

  console.log('👤 Accounts:');
  console.log(`   Owner: ${owner.address}`);
  console.log(`   User1: ${user1.address}`);
  console.log(`   User2: ${user2.address}`);
  console.log(`   User3: ${user3.address}\n`);

  // Deploy contract
  console.log('📜 Deploying HashLierre contract...');
  const HashLierre = await ethers.getContractFactory('HashLierre');
  const token = await HashLierre.deploy();
  await token.deployed();
  console.log(`✅ Contract deployed at: ${token.address}\n`);

  // Generate merkle tree with test data
  console.log('🌳 Generating Merkle Tree...');
  const merkleData = await generateMerkleTree();
  console.log('');

  // Set merkle root
  console.log('📝 Setting Merkle Root on contract...');
  const tx = await token.setMerkleRoot(merkleData.merkleRoot);
  await tx.wait();
  console.log(`✅ Merkle root set: ${merkleData.merkleRoot}\n`);

  // Verify merkle root
  const contractRoot = await token.merkleRoot();
  console.log(`🔍 Verified merkle root matches: ${contractRoot === merkleData.merkleRoot}\n`);

  // Simulate claims
  console.log('💰 Simulating Airdrop Claims...\n');

  for (const recipient of merkleData.recipients) {
    const signer = [owner, user1, user2, user3].find(
      s => s.address.toLowerCase() === recipient.address.toLowerCase()
    );

    if (!signer) {
      console.log(`   ⚠️  Skipping ${recipient.address} (not in test signers)`);
      continue;
    }

    console.log(`   Claiming for ${recipient.address.slice(0, 10)}...`);
    
    try {
      const claimTx = await token.connect(signer).claimAirdrop(
        recipient.amount,
        recipient.proof
      );
      await claimTx.wait();

      const balance = await token.balanceOf(recipient.address);
      const balanceFormatted = ethers.utils.formatUnits(balance, 8);
      
      console.log(`   ✅ Claimed ${recipient.amountFormatted} HLRR`);
      console.log(`      New balance: ${balanceFormatted} HLRR`);
      
      // Verify claimed status
      const hasClaimed = await token.hasClaimedAirdrop(recipient.address);
      console.log(`      Claimed status: ${hasClaimed}\n`);
    } catch (error) {
      console.log(`   ❌ Claim failed: ${error.message}\n`);
    }
  }

  // Try to claim twice (should fail)
  console.log('🔒 Testing double-claim protection...');
  const firstRecipient = merkleData.recipients[0];
  const firstSigner = [owner, user1, user2, user3].find(
    s => s.address.toLowerCase() === firstRecipient.address.toLowerCase()
  );

  if (firstSigner) {
    try {
      await token.connect(firstSigner).claimAirdrop(
        firstRecipient.amount,
        firstRecipient.proof
      );
      console.log('   ❌ SECURITY ISSUE: Double claim succeeded!\n');
    } catch (error) {
      console.log(`   ✅ Double claim correctly rejected: ${error.message}\n`);
    }
  }

  // Test invalid proof
  console.log('🔒 Testing invalid proof protection...');
  const fakeProof = ['0x' + '0'.repeat(64)];
  try {
    await token.connect(user1).claimAirdrop(
      ethers.utils.parseUnits('9999', 8),
      fakeProof
    );
    console.log('   ❌ SECURITY ISSUE: Invalid proof accepted!\n');
  } catch (error) {
    console.log(`   ✅ Invalid proof correctly rejected: ${error.message}\n`);
  }

  // Final statistics
  console.log('📊 Final Statistics:');
  const totalSupply = await token.totalSupply();
  console.log(`   Total Supply: ${ethers.utils.formatUnits(totalSupply, 8)} HLRR`);
  
  let totalClaimed = 0;
  for (const recipient of merkleData.recipients) {
    const claimed = await token.hasClaimedAirdrop(recipient.address);
    if (claimed) totalClaimed++;
  }
  console.log(`   Claims Completed: ${totalClaimed}/${merkleData.totalRecipients}`);
  console.log('');

  console.log('✨ Test Complete!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
