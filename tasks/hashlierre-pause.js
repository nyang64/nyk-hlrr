import { task } from "hardhat/config";

task("hl-pause", "Pause or resume staking", {
       token: {
          type: "string",
          description: "the token / contract address 0x...",
       },
       paused: {
          type: "string",
          description: "true or false",
       }
    },
    async (args, hre) => {
    const { ethers } = hre;

    const token = await ethers.getContractAt("HashLierre", args.token);

    const paused = args.paused === "true";

    const tx = await token.pauseStaking(paused);
    await tx.wait();

    console.log("Staking paused =", paused);
  });

