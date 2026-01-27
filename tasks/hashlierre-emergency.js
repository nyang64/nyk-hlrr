import { task } from "hardhat/config";

task("hl-emergency", "Enable or disable emergency mode", {
       token: {
          type: "string",
          description: "the token / contract address 0x...",
       },
       enabled: {
          type: "string",
          description: "true or false",
       }
    },
    async (args, hre) => {
    const { ethers } = hre;

    const token = await ethers.getContractAt("HashLierre", args.token);

    const enabled = args.enabled === "true";

    const tx = await token.enableEmergency(enabled);
    await tx.wait();

    console.log("Emergency mode =", enabled);
  });

