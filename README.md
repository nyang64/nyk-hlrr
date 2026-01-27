hardhat deploy a contract to arbitrum L2 network:
edit hardhat.config.ts, add network, and imports

this project is reverted back to hardhat 2, ethers 5, and node 20

node -v
if not 20, do this:  nvm install 20 ;  nvm use 20
HashLierre is deployed to sepolia via Remix:
contract address
0x27e99baA94E143E17A4Ec09334639329eEA901bb
transaction cost: 1560833
Verifications from remix:
 https://repo.sourcify.dev/11155111/0x27e99baA94E143E17A4Ec09334639329eEA901bb
 https://eth-sepolia.blockscout.com/address/0x27e99baA94E143E17A4Ec09334639329eEA901bb?tab=contract
 https://testnet.routescan.io/address/0x27e99baA94E143E17A4Ec09334639329eEA901bb/contract/11155111/code

export $(grep -v '#' .env | xargs)

//verify hardhat can connect to L2
npx hardhat console --network localArbitrumL2 --show-stack-traces
in hardhat terminal:
const { JsonRpcProvider, Wallet } = await import("ethers");
const provider = new JsonRpcProvider("http://localhost:8547");
await provider.getBlockNumber();

or do the following:
const conn = await hre.network.connect()
await conn.provider.send("eth_blockNumber", [])
//it should have some non zero block number returned
npx hardhat compile

edit deploy.js to use meta data file of Coin.json

npx hardhat run scripts/deploy.js --network localArbitrumL2
Deployed to: 0xA6E41fFD769491a42A6e5Ce453259b93983a22EF

in local Arbitrum L2 log:
Submitted contract creation
hash=0xcc01b514864ba6c1af135f0826ae205c223f2b5282d8144dba722fc9ce9aa5eb
from=0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E
nonce=3
contract=0xA6E41fFD769491a42A6e5Ce453259b93983a22EF
value=0

verify code from hardhat:
const provider = new JsonRpcProvider("http://localhost:8547");
await provider.getCode("0xA6E41fFD769491a42A6e5Ce453259b93983a22EF");

check receipt of contract:
const receipt = await provider.getTransactionReceipt("0xcc01b514864ba6c1af135f0826ae205c223f2b5282d8144dba722fc9ce9aa5eb");
console.log(receipt.status); // should be 1

//now let us mint some coin
edit scripts/mint.js

npx hardhat run scripts/mint.js --network localArbitrumL2
Minter address: 0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E
Tx hash: 0x2094e237ea1a08d07872901da3cc4f5b90180a2707aa813b56a7b3a505804727
Receiver balance: 1000

//L2 network log
sequencer-1  | INFO [01-18|05:56:55.218] Submitted transaction                    hash=0x2094e237ea1a08d07872901da3cc4f5b90180a2707aa813b56a7b3a505804727 from=0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E nonce=4    recipient=0xA6E41fFD769491a42A6e5Ce453259b93983a22EF value=0

npx hardhat run scripts/check-minter-balance.js --network localArbitrumL2




# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js
```
