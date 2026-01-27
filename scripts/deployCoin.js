import { JsonRpcProvider, Wallet, ContractFactory } from "ethers";
import fs from "fs";

// connect to your L2
const provider = new JsonRpcProvider("http://localhost:8547");

// load private key
const pk = process.env.LOCAL_PRIVATE_KEY;
const wallet = new Wallet(pk, provider);

// load compiled artifact (example)
const artifact = JSON.parse(fs.readFileSync("./artifacts/contracts/Coin.sol/Coin.json"));

async function main() {
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();

  await contract.waitForDeployment();

  console.log("Deployed to:", await contract.getAddress());
}

main();
