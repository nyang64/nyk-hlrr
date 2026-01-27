import { task } from "hardhat/config";

task("hl-mint", "Mint more HashLierre", {
       token: {
          type: "string",
          description: "the token / contract address 0x...",
       },
       amount: {
          type: "string",
          description: "mint amount (whole tokens, no decimals)",
       },
       tag: {
          type: "string",
          description: "Deployment tag",
          default: "extra",
       }
    }, 
    async (args, hre) => {
    const { ethers } = hre;

    const token = await ethers.getContractAt("HashLierre", args.token);
    const [signer] = await ethers.getSigners();

    const amount = BigInt(args.amount) * 10n ** 18n;

    const tx = await token.mint(
      await signer.getAddress(),
      amount,
      args.tag
    );
    await tx.wait();

    console.log("Minted", args.amount, "H#L");
  });

