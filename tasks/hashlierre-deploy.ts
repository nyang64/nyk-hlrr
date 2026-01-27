import { task } from "hardhat/config";

task("hl-deploy", "Deploy HashLierre")
  .setAction(async (args, hre) => {
    // parse process.argv manually
    const argIndex = process.argv.findIndex(a => a === "--amount");
    const amount = argIndex >= 0 ? process.argv[argIndex + 1] : "0";
    const tagIndex = process.argv.findIndex(a => a === "--tag");
    const tag = tagIndex >= 0 ? process.argv[tagIndex + 1] : "genesis";

    const { ethers } = hre;
    const [deployer] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("HashLierre");
    const token = await Token.deploy();
    await token.waitForDeployment();
    const addr = await token.getAddress();
    console.log("Deployed at:", addr);

    if (BigInt(amount) > 0n) {
      await token.mint(deployer.address, BigInt(amount) * 10n ** 18n, tag);
      console.log("Minted", amount, "H#L with tag", tag);
    }
  });

