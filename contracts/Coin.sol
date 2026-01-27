// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.28;

// This will only compile via IR
//@author Nanchang Yang
//@dev: a contract for owner to mint new coin, and for anyone to send coins to a receiver
contract Coin {
    // The keyword "public" makes variables
    // accessible from other contracts

    // minter address
    address immutable public minter;
    // map of account with balances
    mapping(address account => uint amount) public balances;

    // Events allow clients to react to specific
    // contract changes you declare
    event Sent(address indexed from, address indexed to, uint amount);
    event Minted(address indexed to, uint amount);
    event Deployed(address indexed minter);

    // @notice: Modifier for access control: restricts to minter only
    modifier onlyMinter() {
        require(msg.sender == minter, "Only minter can call this function");
        _;  // Continues execution after the check
    }
    // Constructor code is only run when the contract
    // is created
    // @inheritdoc 
    // @notice: minter address is set
    constructor() {
        minter = msg.sender;
        emit Deployed(minter);
    }

    // Sends an amount of newly created coins to an address
    // Can only be called by the contract creator
    // @notice: for contract owner to mint new coin
    // @dev: contract owner creates new coin
    function mint(address receiver, uint amount) external onlyMinter {
        require(receiver != address(0), "Cannot mint to zero address");
        require(amount > 0 && amount < 1e18, "Amount out of bounds");
        balances[receiver] += amount;
        emit Minted(receiver, amount);
    }

    // Errors allow you to provide information about
    // why an operation failed. They are returned
    // to the caller of the function.
    error InsufficientBalance(uint requested, uint available);

    // Sends an amount of existing coins
    // from any caller to an address
    // @notice: for anyone to sent coin to a receiver
    // @dev: anyone can send their coin to a receiver address
    function send(address receiver, uint amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(amount <= balances[msg.sender], InsufficientBalance(amount, balances[msg.sender]));
        require(receiver != address(0), "Cannot send to zero address");

        balances[msg.sender] -= amount;
        balances[receiver] += amount;
        emit Sent(msg.sender, receiver, amount);
    }
}
