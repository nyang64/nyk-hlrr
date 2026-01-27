import { task } from "hardhat/config";

task("hl-unstake", "Unstake HashLierre", {
    token: {
          type: "string",
          description: "the token / contract address 0x...",
       },
       amount: {
          type: "string",
          description: "mint amount (whole tokens, no decimals)",
       }
    },
    async (args, hre) => {
    const { ethers } = hre;

    const token = await ethers.getContractAt("HashLierre", args.token);

    const amount = BigInt(args.amount) * 10n ** 18n;

    const tx = await token.unstake(amount);
    await tx.wait();

    console.log("Unstaked", args.amount, "H#L");
  });

