#!/bin/bash

# Merkle Airdrop Setup and Test Script
# Run this to set up and test the merkle airdrop functionality

echo "🚀 HashLierre Merkle Airdrop Setup"
echo "=================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing base dependencies..."
    npm install
fi

# Install merkle dependencies
echo "📦 Installing merkle airdrop dependencies..."
npm install merkletreejs keccak256

echo ""
echo "✅ Dependencies installed!"
echo ""

# Run tests
echo "🧪 Running tests..."
echo ""
npx hardhat test

echo ""
echo "📝 Generating sample merkle tree..."
echo ""
npx hardhat run scripts/generateMerkleTree.js

echo ""
echo "🎯 Running full airdrop simulation..."
echo ""
npx hardhat run scripts/testAirdrop.js

echo ""
echo "✨ Setup complete!"
echo ""
echo "📖 Next steps:"
echo "   1. Review airdrop-merkle-data.json"
echo "   2. Edit scripts/generateMerkleTree.js with your recipients"
echo "   3. Deploy with: npx hardhat run scripts/deployWithAirdrop.js --network <network>"
echo ""
echo "📚 Documentation:"
echo "   - Quick Start: README_MERKLE_AIRDROP.md"
echo "   - Full Guide: MERKLE_AIRDROP_GUIDE.md"
echo ""
