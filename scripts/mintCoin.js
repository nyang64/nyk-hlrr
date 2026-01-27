// 1️⃣ Import ethers in Hardhat console (v6 style)
const { JsonRpcProvider, Wallet, Contract } = await import("ethers");
import fs from "fs";

// 2️⃣ Connect to your L2 RPC
const provider = new JsonRpcProvider("http://localhost:8547");

// 3️⃣ Load your minter (the deployer) key
const minterPk = process.env.LOCAL_PRIVATE_KEY; // deployer/minter
const minter = new Wallet(minterPk, provider);
const receiver = await minter.getAddress(); 
console.log("Minter address:", receiver);

// 4️⃣ Load your Coin contract
const contractAddress = "0xA6E41fFD769491a42A6e5Ce453259b93983a22EF";
const artifact = JSON.parse(fs.readFileSync("./artifacts/contracts/Coin.sol/Coin.json"));
const contract = new Contract(contractAddress, artifact.abi, minter);

// if we want to send minted coin to a different wallet than the minter's
//const myWalletPk = process.env.MY_WALLET_PRIVATE_KEY;
//const myWallet = new Wallet(myWalletPk, provider);
//const receiver = await myWallet.getAddress();
//console.log("Receiver address:", receiver);

// 6️⃣ Mint coins
const amount = 1000; // your desired amount
const tx = await contract.mint(receiver, amount);
console.log("Tx hash:", tx.hash);
await tx.wait();

// 7️⃣ Verify balance
const bal = await contract.balances(receiver);
console.log("Receiver balance:", bal.toString());

