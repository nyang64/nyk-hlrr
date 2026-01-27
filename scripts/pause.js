import { ethers } from "ethers";
import yargs from "yargs";

const argv = yargs(process.argv.slice(2))
  .option("tokenAddress", { type: "string", demandOption: true })
  .option("pause", { type: "boolean", demandOption: true })
  .argv;

async function main() {
  const token = await ethers.getContractAt("HashLierre", argv.tokenAddress);
  const tx = await token.pauseStaking(argv.pause);
  await tx.wait();
  console.log(`Staking paused: ${argv.pause}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

