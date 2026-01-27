import { ethers } from "ethers";
import yargs from "yargs";

const argv = yargs(process.argv.slice(2))
  .option("tokenAddress", { type: "string", demandOption: true })
  .option("amount", { type: "number", demandOption: true })
  .argv;

async function main() {
  const token = await ethers.getContractAt("HashLierre", argv.tokenAddress);
  const decimals = await token.decimals();
  const amount = ethers.BigNumber.from(argv.amount).mul(ethers.BigNumber.from(10).pow(decimals));

  const tx = await token.stake(amount);
  await tx.wait();
  console.log(`Staked ${argv.amount} H#L tokens`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

