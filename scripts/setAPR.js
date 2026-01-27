import { ethers } from "ethers";
import yargs from "yargs";

const argv = yargs(process.argv.slice(2))
  .option("tokenAddress", { type: "string", demandOption: true })
  .option("apr", { type: "string", demandOption: true })
  .argv;

async function main() {
  const token = await ethers.getContractAt("HashLierre", argv.tokenAddress);
  const tx = await token.setAPR(argv.apr);
  await tx.wait();
  console.log(`APR updated to: ${argv.apr}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

