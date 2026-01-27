import { task } from "hardhat/config";

task("hl-claim", "Claim & restake rewards", {
       token: {
          type: "string",
          description: "the token / contract address 0x...",
       }
    },
    async (args, hre) => {
    const { ethers } = hre;

    const token = await ethers.getContractAt("HashLierre", args.token);

    const tx = await token.claimReward();
    await tx.wait();

    console.log("Rewards claimed and restaked");
  });

