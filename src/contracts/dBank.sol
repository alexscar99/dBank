// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "./Token.sol";

contract dBank {
    // state variable and mappings
    Token private token;

    mapping(address => uint) public etherBalanceOf;
    mapping(address => uint) public depositStart;
    mapping(address => uint) public collateralEther;

    mapping(address => bool) public isDeposited;
    mapping(address => bool) public isBorrowed;

    // events
    event Deposit(address indexed user, uint etherAmount, uint timeStart);
    event Withdraw(address indexed user, uint etherAmount, uint depositTime, uint interest);
    event Borrow(address indexed user, uint collateralEtherAmount, uint borrowedTokenAmount);
    event PayOff(address indexed user, uint fee);

    // pass as constructor argument deployed Token contract
    constructor(Token _token) public {
        token = _token;
    }

    function deposit() payable public {
        require(isDeposited[msg.sender] == false, "Error, deposit already active");
        require(msg.value >= 1e16, "Error, deposit must be >= 0.01 ETH");

        // set ETH balance for sender and start time of deposit for sender
        etherBalanceOf[msg.sender] = etherBalanceOf[msg.sender] + msg.value;
        depositStart[msg.sender] = depositStart[msg.sender] + block.timestamp;

        // make isDeposited true for sender and emit 'Deposit' event
        isDeposited[msg.sender] = true;
        emit Deposit(msg.sender, msg.value, block.timestamp);
    }

    function withdraw() public {
        require(isDeposited[msg.sender] == true, "Error, no previous deposit");
        uint userBalance = etherBalanceOf[msg.sender];

        // check user's hold time
        uint depositTime = block.timestamp - depositStart[msg.sender];

        // calculate interest per second
            // 31668017 - interest (@ 10% APY) per second for min. deposit amount (0.01 ETH) because
            // 1e15(10% of 0.01 ETH) / 31577600 (seconds in 365.25 days)
        uint interestPerSecond = 31668017 * (etherBalanceOf[msg.sender] / 1e16);

        // calculate accrued interest
            // (etherBalanceOf[msg.sender] / 1e16) - calc. how much higher interest will be (based on deposit)
            // for min. deposit (0.01 ETH), (etherBalanceOf[msg.sender] / 1e16) = 1 (the same, 31668017/sec)
            // for deposit 0.02 ETH, (etherBalanceOf[msg.sender] / 1e16) = 2 (doubled or (2*31668017)/sec)
        uint interest = interestPerSecond * depositTime;

        // send funds to user
        msg.sender.transfer(userBalance);
        token.mint(msg.sender, interest);

        // reset depositor data
        depositStart[msg.sender] = 0;
        etherBalanceOf[msg.sender] = 0;
        isDeposited[msg.sender] = false;

        // emit Withdraw event
        emit Withdraw(msg.sender, userBalance, depositTime,interest);
    }

    function borrow() payable public {
        require(msg.value >= 1e16, "Error, collateral must be >= 0.01 ETH");
        require(isBorrowed[msg.sender] == false, "Error, loan already taken");

        // this ETH will be locked until user pays off the loan (payOff function)
        collateralEther[msg.sender] = collateralEther[msg.sender] + msg.value;

        // calc tokens amount to mint, 50% of msg.value
        uint tokensToMint = collateralEther[msg.sender] / 2;

        // mint and send tokens to user
        token.mint(msg.sender, tokensToMint);

        // activate borrower's loan status
        isBorrowed[msg.sender] = true;

        // emit Borrow event
        emit Borrow(msg.sender, collateralEther[msg.sender], tokensToMint);
    }

    function payOff() public {
        // check if loan is active

        // transfer tokens from user back to contract

        // calculate fee

        // send user's collateral minus fee

        // reset borrower's data

        // emit event
    }
}