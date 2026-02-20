require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  networks: {
    hardhat: {
      // Fork BASE mainnet: FORK=base npx hardhat test
      // Fork Base Sepolia: FORK=base-sepolia npx hardhat test
      chainId: process.env.FORK === "base" ? 8453 :
               process.env.FORK === "base-sepolia" ? 84532 : 31337,
      forking: process.env.FORK === "base" ? {
        url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      } : process.env.FORK === "base-sepolia" ? {
        url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      } : undefined,
    },

    // =====================
    // BASE Networks (Primary)
    // =====================
    base_mainnet: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts: process.env.BASE_MAINNET_PRIVATE_KEY ? [process.env.BASE_MAINNET_PRIVATE_KEY] : [],
    },
    base_sepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
    },

    // =====================
    // Other Networks (Optional)
    // =====================
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
    },
    arbitrumOne: {
      url: "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts: process.env.ARB_PRIVATE_KEY ? [process.env.ARB_PRIVATE_KEY] : [],
    },
    arbitrumOneSepolia: {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: process.env.ARB_PRIVATE_KEY ? [process.env.ARB_PRIVATE_KEY] : [],
    },

    // Local development
    localArbitrumL2: {
      url: "http://localhost:8547",
      chainId: 412346,
      accounts: process.env.LOCAL_PRIVATE_KEY ? [process.env.LOCAL_PRIVATE_KEY] : [],
      gas: "auto",
      gasPrice: "auto",
    },
    localEthereumL1: {
      url: "http://localhost:8545",
      chainId: 1337,
      accounts: process.env.LOCAL_PRIVATE_KEY ? [process.env.LOCAL_PRIVATE_KEY] : [],
    },
  },
};
