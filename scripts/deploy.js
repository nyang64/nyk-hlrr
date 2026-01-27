import { JsonRpcProvider, Wallet, ContractFactory } from "ethers";
import fs from "fs";

const tag = "genesis";
const amount = 10000000;

async function main() {
    const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const signer = new Wallet(process.env.SEPOLIA_PRIVATE_KEY, provider);

    const artifact = JSON.parse(fs.readFileSync("./artifacts/contracts/HashLierre.sol/HashLierre.json"));
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);

    const token = await factory.deploy();
    await token.waitForDeployment();
    const addr = await token.getAddress();
    console.log("Deployed at:", addr);

    if (BigInt(amount) > 0n) {
      await token.mint(signer.address, BigInt(amount) * 10n ** 18n, tag);
      console.log("Minted", amount, "hlrr with tag", tag);
    }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

