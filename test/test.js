import { expect } from 'chai';
import { tokens, ether, ETHER_ADDRESS, EVM_REVERT, wait } from './helpers';

const Token = artifacts.require('./Token');
const DecentralizedBank = artifacts.require('./dBank');

require('chai')
  .use(require('chai-as-promised'))
  .should();

contract('dBank', ([deployer, user]) => {
  let dbank, token;
  const interestPerSecond = 31668017; // (10% APY) for min. deposit (0.01 ETH)

  beforeEach(async () => {
    token = await Token.new();
    dbank = await DecentralizedBank.new(token.address);
    await token.passMinterRole(dbank.address, { from: deployer });
  });

  describe('testing token contract...', () => {
    describe('success', () => {
      it('checks token name', async () => {
        expect(await token.name()).to.be.eq('Decentralized Bank Currency');
      });

      it('checks token symbol', async () => {
        expect(await token.symbol()).to.be.eq('DBC');
      });

      it('checks token initial total supply is 0', async () => {
        expect(Number(await token.totalSupply())).to.eq(0);
      });

      it('makes sure that Token minter role has been transferred to dBank', async () => {
        expect(await token.minter()).to.eq(dbank.address);
      });
    });

    describe('failure', () => {
      it('rejects passing of minter role', async () => {
        await token.passMinterRole(user, { from: deployer }).should.be.rejectedWith(EVM_REVERT);
      });

      it('rejects unauthorized token minting', async () => {
        await token.mint(user, '1', { from: deployer }).should.be.rejectedWith(EVM_REVERT); // unauthorized minter
      });
    });
  });

  describe('testing deposit...', () => {
    let balance;

    describe('success', () => {
      beforeEach(async () => {
        await dbank.deposit({ value: 10 ** 16, from: user }); // 0.01 ETH
      });

      it('increases balance', async () => {
        expect(Number(await dbank.etherBalanceOf(user))).to.eq(10 ** 16);
      });

      it('has a deposit time that is greater than 0', async () => {
        expect(Number(await dbank.depositStart(user))).to.be.above(0);
      });

      it('has a deposit status of true', async () => {
        expect(await dbank.isDeposited(user)).to.eq(true);
      });
    });

    describe('failure', () => {
      it('rejects depositing', async () => {
        await dbank.deposit({ value: 10 ** 15, from: user }).should.be.rejectedWith(EVM_REVERT); //to small amount
      });
    });
  });

  describe('testing withdraw...', () => {
    let balance;

    describe('success', () => {

      beforeEach(async () => {
        await dbank.deposit({ value: 10 ** 16, from: user }); // 0.01 ETH

        await wait(2); // accruing interest

        balance = await web3.eth.getBalance(user);
        await dbank.withdraw({ from: user });
      });

      it('decreases balances', async () => {
        expect(Number(await web3.eth.getBalance(dbank.address))).to.eq(0);
        expect(Number(await dbank.etherBalanceOf(user))).to.eq(0);
      });

      it('gives user ether back', async () => {
        expect(Number(await web3.eth.getBalance(user))).to.be.above(Number(balance));
      });

      it('ensures user receives proper amount of interest', async () => {
        // time synchronization problem make us check the 1-3s range for 2s deposit time
        balance = Number(await token.balanceOf(user));
        expect(balance).to.be.above(0);
        expect(balance % interestPerSecond).to.eq(0);
        expect(balance).to.be.below(interestPerSecond * 4);
      });

      it('resets depositor data', async () => {
        expect(Number(await dbank.depositStart(user))).to.eq(0);
        expect(Number(await dbank.etherBalanceOf(user))).to.eq(0);
        expect(await dbank.isDeposited(user)).to.eq(false);
      });
    });

    describe('failure', () => {
      it('rejects withdrawals', async () => {
        await dbank.deposit({ value: 10 ** 16, from: user }); //0.01 ETH
        await wait(2); //accruing interest
        await dbank.withdraw({ from: deployer }).should.be.rejectedWith(EVM_REVERT); //wrong user
      });
    });
  });

  describe('testing borrow...', () => {
    describe('success', () => {
      beforeEach(async () => {
        await dbank.borrow({ value: 10 ** 16, from: user }); // 0.01 ETH
      });

      it('increases token total supply', async () => {
        expect(Number(await token.totalSupply())).to.eq(5 * (10 ** 15)); // (10 ** 16) / 2
      });

      it('increases balance of user', async () => {
        expect(Number(await token.balanceOf(user))).to.eq(5 * (10 ** 15)); // (10 ** 16) / 2
      });

      it('increases Ether collateral', async () => {
        expect(Number(await dbank.collateralEther(user))).to.eq(10 ** 16); // 0.01 ETH
      });

      it('has a user borrowed status of true', async () => {
        expect(await dbank.isBorrowed(user)).to.eq(true);
      });
    });

    describe('failure', () => {
      it('rejects borrowing', async () => {
        await dbank.borrow({ value: 10 ** 15, from: user }).should.be.rejectedWith(EVM_REVERT); // to small amount
      });
    });
  });

  describe('testing payoff...', () => {
    describe('success', () => {
      beforeEach(async () => {
        await dbank.borrow({ value: 10 ** 16, from: user }); // 0.01 ETH
        await token.approve(dbank.address, (5 * (10 ** 15)).toString(), { from: user });
        await dbank.payOff({ from: user });
      });

      it('should set user token balance to 0', async () => {
        expect(Number(await token.balanceOf(user))).to.eq(0);
      });

      it('adds fee to dBank ETH balance', async () => {
        expect(Number(await web3.eth.getBalance(dbank.address))).to.eq(10 ** 15); // 10% of 0.01 ETH
      });

      it('resets borrower data', async () => {
        expect(Number(await dbank.collateralEther(user))).to.eq(0);
        expect(await dbank.isBorrowed(user)).to.eq(false);
      });
    });

    describe('failure', () => {
      it('rejects attempts to pay off', async () => {
        await dbank.borrow({ value: 10 ** 16, from: user }); // 0.01 ETH
        await token.approve(dbank.address, (5 * (10 ** 15)).toString(), { from: user });
        await dbank.payOff({ from: deployer }).should.be.rejectedWith(EVM_REVERT); // wrong user
      });
    });
  });
});