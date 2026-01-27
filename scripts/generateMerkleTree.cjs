const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

/**
 * Generate Merkle Tree for Airdrop
 * 
 * This script generates a merkle tree from an airdrop list and outputs:
 * 1. Merkle root (to set on contract)
 * 2. Individual proofs for each recipient (for claiming)
 */

async function generateMerkleTree() {
  console.log('🌳 Generating Merkle Tree for Airdrop...\n');

  // Example airdrop list - Replace with your actual recipients
  // Format: { address: "0x...", amount: "amount_in_base_units" }
  const airdropList = [
    { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', amount: ethers.utils.parseUnits('1000', 8).toString() }, // 1000 tokens
    { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', amount: ethers.utils.parseUnits('500', 8).toString() },  // 500 tokens
    { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', amount: ethers.utils.parseUnits('250', 8).toString() },  // 250 tokens
    { address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', amount: ethers.utils.parseUnits('100', 8).toString() },  // 100 tokens
    { address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', amount: ethers.utils.parseUnits('750', 8).toString() },  // 750 tokens
  ];

  console.log(`📋 Airdrop List (${airdropList.length} recipients):`);
  airdropList.forEach((entry, i) => {
    const tokenAmount = ethers.utils.formatUnits(entry.amount, 8);
    console.log(`   ${i + 1}. ${entry.address} → ${tokenAmount} HLRR`);
  });
  console.log('');

  // Generate leaves (hash of address and amount)
  const leaves = airdropList.map(x => {
    const encoded = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [x.address, x.amount]);
    const innerHash = ethers.utils.keccak256(encoded);
    return keccak256(innerHash);
  });

  // Create Merkle Tree
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = tree.getHexRoot();

  console.log('✅ Merkle Root Generated:');
  console.log(`   ${root}\n`);

  // Generate proofs for each recipient
  const airdropsWithProofs = airdropList.map((entry, index) => {
    const encoded = ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [entry.address, entry.amount]);
    const innerHash = ethers.utils.keccak256(encoded);
    const leaf = keccak256(innerHash);
    const proof = tree.getHexProof(leaf);

    return {
      address: entry.address,
      amount: entry.amount,
      amountFormatted: ethers.utils.formatUnits(entry.amount, 8),
      proof: proof,
    };
  });

  // Prepare output data
  const output = {
    merkleRoot: root,
    totalRecipients: airdropList.length,
    totalAmount: airdropList.reduce((sum, x) => sum.add(ethers.BigNumber.from(x.amount)), ethers.BigNumber.from(0)).toString(),
    totalAmountFormatted: ethers.utils.formatUnits(
      airdropList.reduce((sum, x) => sum.add(ethers.BigNumber.from(x.amount)), ethers.BigNumber.from(0)),
      8
    ),
    recipients: airdropsWithProofs,
  };

  // Save to JSON file
  const outputPath = path.join(__dirname, '../airdrop-merkle-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log('📁 Output saved to: airdrop-merkle-data.json');
  console.log(`   Total Recipients: ${output.totalRecipients}`);
  console.log(`   Total Amount: ${output.totalAmountFormatted} HLRR\n`);

  // Display example proof
  console.log('📝 Example Proof (first recipient):');
  console.log(`   Address: ${airdropsWithProofs[0].address}`);
  console.log(`   Amount: ${airdropsWithProofs[0].amountFormatted} HLRR`);
  console.log(`   Proof: ${JSON.stringify(airdropsWithProofs[0].proof, null, 2)}\n`);

  // Instructions
  console.log('📖 Next Steps:');
  console.log('   1. Call setMerkleRoot() with the merkle root above');
  console.log('   2. Share airdrop-merkle-data.json with your frontend');
  console.log('   3. Users can call claimAirdrop(amount, proof) to claim their tokens\n');

  return output;
}

// Helper function to load airdrop list from CSV
async function loadFromCSV(csvPath) {
  const csv = require('csv-parser');
  const results = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (data) => {
        // Expecting CSV with columns: address, amount
        results.push({
          address: data.address,
          amount: ethers.utils.parseUnits(data.amount, 8).toString(),
        });
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', reject);
  });
}

// Run if called directly
if (require.main === module) {
  generateMerkleTree()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { generateMerkleTree, loadFromCSV };
