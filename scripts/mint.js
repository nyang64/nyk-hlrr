import { ethers } from "ethers";
import yargs from "yargs";

const argv = yargs(process.argv.slice(2))
  .option("tokenAddress", { type: "string", demandOption: true })
  .option("amount", { type: "number", demandOption: true })
  .option("tag", { type: "string", demandOption: true })
  .argv;

async function main() {
  const token = await ethers.getContractAt("HashLierre", argv.tokenAddress);
  const tx = await token.mint(
    await ethers.getSigner().getAddress(),
    ethers.BigNumber.from(argv.amount).mul(ethers.BigNumber.from(10).pow(18)),
    argv.tag
  );
  await tx.wait();
  console.log(`Minted ${argv.amount} tokens to deployer with tag: ${argv.tag}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

