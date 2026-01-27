import { ethers } from "ethers";
import * as hre from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

// Helper to parse CLI arguments like --argName value
function getArgValue(argName: string): string | undefined {
    const index = process.argv.indexOf(argName);
    if (index !== -1 && index + 1 < process.argv.length) {
        return process.argv[index + 1];
    }
    return undefined;
}

async function main() {
    // --- Parse CLI args ---
    const artifactName = getArgValue("--artifact");
    if (!artifactName) throw new Error("Missing --artifact argument");

    const tokenAddress = getArgValue("--token-address");
    if (!tokenAddress) throw new Error("Missing --token-address argument");

    const tag = getArgValue("--tag") || "mint";
    const amountArg = getArgValue("--amount") || "0";
    const amount = ethers.parseUnits(amountArg, 18); // 18 decimals

    // --- Setup provider + wallet ---
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.SEPOLIA_PRIVATE_KEY!, provider);
    console.log("Using wallet:", wallet.address);

    // --- Load contract artifact + connect to deployed contract ---
    const artifact = await hre.artifacts.readArtifact(artifactName);
    const contract = new ethers.Contract(tokenAddress, artifact.abi, wallet);

    // --- Mint tokens ---
    console.log(`Minting ${ethers.formatUnits(amount, 18)} tokens with tag "${tag}"...`);
    const tx = await contract.mint(wallet.address, amount, tag);
    await tx.wait();

    // --- Verify balance ---
    const balance = await contract.balanceOf(wallet.address);
    console.log("New deployer token balance:", ethers.formatUnits(balance, 18));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

