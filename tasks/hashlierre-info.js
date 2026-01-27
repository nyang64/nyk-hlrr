import { task } from "hardhat/config";

task("hl-info", "Show staking info", {
       token: {
          type: "string",
          description: "the token / contract address 0x...",
       },
       user: {
          type: "string",
          description: "user address",
       }
    },
    async (args, hre) => {
    const { ethers } = hre;

    const token = await ethers.getContractAt("HashLierre", args.token);

    const apr = await token.apr();
    const totalStaked = await token.totalStaked();

    console.log("APR:", apr.toString());
    console.log("Total staked:", totalStaked.toString());

    if (args.user) {
      const staked = await token.stakedBalance(args.user);
      const pending = await token.pendingReward(args.user);
      console.log("User staked:", staked.toString());
      console.log("User pending reward:", pending.toString());
    }
  });

