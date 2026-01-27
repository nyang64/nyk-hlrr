import { task } from "hardhat/config";

task("hl-set-apr", "Set staking APR", {
       token: {
          type: "string",
          description: "the token / contract address 0x...",
       },
       apr: {
          type: "string",
          description: "APR in 1e18 scale (e.g. 120000000000000000)",
       }
    },
    async (args, hre) => {
    const { ethers } = hre;

    const token = await ethers.getContractAt("HashLierre", args.token);

    const tx = await token.setAPR(args.apr);
    await tx.wait();

    console.log("APR updated to:", args.apr);
  });

