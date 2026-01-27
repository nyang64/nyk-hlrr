require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
require("dotenv").config(); // load .env variables

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
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
  // Configure Hardhat to find the forge-std library
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  networks: {
    localArbitrumL2: {
      url: "http://localhost:8547",
      chainId: 412346,
      accounts: [process.env.LOCAL_PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
    },
    localEthereumL1: {
      url: "http://localhost:8545",
      chainId: 1337,
      accounts: [process.env.LOCAL_PRIVATE_KEY],
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY],
    },
    sepolia_base: {
      url: "https://sepolia.base.org",
      chainId: 84532,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY],
    },
    mainnet_base: {
      url: "https://mainnet.base.org",
      chainId: 8453,
      accounts: [process.env.BASE_MAINNET_PRIVATE_KEY],
    },
    testnet_bsc: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY],
    },
    mainnet_bsc: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: [process.env.BSC_MAINNET_PRIVATE_KEY],
    },
    arbitrumOne: {
      url: "https://arb1.arbitrum.io/rpc",
      chainId: 42161,
      accounts: [process.env.ARB_PRIVATE_KEY],
    },
    arbitrumOneSepolia: {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: [process.env.ARB_PRIVATE_KEY],
    },
  },
};

