import { ethers } from "hardhat";
import yargs from "yargs";

const argv = yargs(process.argv.slice(2))
  .option("tokenAddress", { type: "string", demandOption: true })
  .argv;

async function main() {
  const token = await ethers.getContractAt("HashLierre", argv.tokenAddress);
  const tx = await token.claimReward();
  await tx.wait();
  console.log("Claimed rewards (auto-restaked)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

