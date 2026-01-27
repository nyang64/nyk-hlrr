import { JsonRpcProvider, Wallet, Contract } from "ethers";
import fs from "fs";

const RPC = "http://localhost:8547";
const CONTRACT = "0xA6E41fFD769491a42A6e5Ce453259b93983a22EF";

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const minterPk = process.env.LOCAL_PRIVATE_KEY;
  const minter = new Wallet(minterPk, provider);
  
  const artifact = JSON.parse(fs.readFileSync("./artifacts/contracts/Coin.sol/Coin.json"));
  const contract = new Contract(CONTRACT, artifact.abi, minter);

  const bal = await contract.balances(await minter.getAddress());
  console.log("Minter Coin balance:", bal.toString());
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

