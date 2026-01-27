import { ethers } from "ethers";
import * as hre from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.SEPOLIA_PRIVATE_KEY!, provider);

    const HashLierreFactory = await ethers.ContractFactory.fromSolidity(
        await hre.artifacts.readArtifact("HashLierre"), 
        wallet
    );

    const hashLierre = await HashLierreFactory.deploy();
    await hashLierre.waitForDeployment();

    console.log("Deployed HashLierre at:", hashLierre.target);
}

main().catch(console.error);

