import { ethers } from "ethers";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  if (!process.env.ETH_MAINNET_RPC_URL) {
    throw new Error("ETH_MAINNET_RPC_URL not set in .env");
  }

  // 1️⃣ Connect to mainnet
  const provider = new ethers.JsonRpcProvider(process.env.ETH_MAINNET_RPC_URL);

  const network = await provider.getNetwork();
  console.log("Connected network:", network.name, "(chainId:", network.chainId, ")");

  const block = await provider.getBlock("latest");
  const baseFee = block.baseFeePerGas ?? 0n; // in wei
  console.log("Latest block:", block.number);
  console.log("Base fee (gwei):", ethers.formatUnits(baseFee, "gwei"));

  // 2️⃣ Get gas price info
  const feeData = await provider.getFeeData();
  console.log("Gas data (gwei):");
  console.log("  Legacy gasPrice: ", ethers.formatUnits(feeData.gasPrice, "gwei"));
  console.log("  MaxFeePerGas:    ", ethers.formatUnits(feeData.maxFeePerGas, "gwei"));
  console.log("  MaxPriorityFee:  ", ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei"));

  // 3️⃣ Estimate deploy + initial mint gas units
  const estimatedGasUnits = 3_000_000n; // ~3M for HashLierre + initial mint

  // Use maxFeePerGas if available (EIP-1559)
  const gasWei = feeData.maxFeePerGas ?? feeData.gasPrice;
  const costEth = (estimatedGasUnits * gasWei) / 10n ** 18n;

  console.log(`Estimated ETH cost for deploy + initial mint: ${costEth} ETH`);
}

main().catch(console.error);

