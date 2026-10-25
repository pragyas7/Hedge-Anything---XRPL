// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {SwitchboardEscrow} from "../src/SwitchboardEscrow.sol";
import {MockERC20} from "./MockERC20.sol";

contract SwitchboardEscrowTest is Test {
    MockERC20 internal token;
    SwitchboardEscrow internal escrow;
    bytes32 internal instrumentId;
    uint256 internal makerPk = 0xA11CE;
    address internal maker;
    address internal taker;

    function setUp() public {
        token = new MockERC20();
        escrow = new SwitchboardEscrow(address(this), address(this), token);
        instrumentId = keccak256("SERVICE_OUTAGE_BINARY");
        escrow.listInstrument(instrumentId, 1000, uint64(block.timestamp + 30 days));
        maker = vm.addr(makerPk);
        taker = vm.addr(0xB0B);
        token.mint(maker, 5_000_000);
        token.mint(taker, 5_000_000);
        vm.prank(maker);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(taker);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(maker);
        escrow.deposit(2_000_000);
        vm.prank(taker);
        escrow.deposit(2_000_000);
    }

    function test_solvencyCollateralCoversOutstandingMaxPayout() public {
        bytes32 orderHash = _fill(instrumentId, 10, 5, 1000, 1);
        assertGe(token.balanceOf(address(escrow)), escrow.outstandingMaxPayout());
        assertGe(escrow.totalLocked(), escrow.outstandingMaxPayout());
        assertEq(token.balanceOf(address(escrow)), escrow.accountedAssets());
        assertEq(escrow.outstandingMaxPayout(), 10 * 1000);
        orderHash;
    }

    function testFuzz_solvency(uint96 qtyRaw, uint96 priceRaw, uint96 maxRaw) public {
        uint256 qty = bound(qtyRaw, 1, 50);
        uint256 price = bound(priceRaw, 1, 50);
        uint256 maxPay = bound(maxRaw, 1, 50);
        bytes32 id = keccak256("fuzz-instrument");
        escrow.listInstrument(id, maxPay, uint64(block.timestamp + 10 days));
        _fill(id, qty, price, maxPay, 9);
        assertGe(token.balanceOf(address(escrow)), escrow.outstandingMaxPayout());
        assertGe(escrow.accountedAssets(), escrow.outstandingMaxPayout());
        assertGe(escrow.totalLocked(), escrow.outstandingMaxPayout());
    }

    function test_idempotentClaimDoesNotPayTwice() public {
        bytes32 orderHash = _fill(instrumentId, 10, 5, 1000, 2);
        escrow.proposeResult(instrumentId, 400);
        vm.warp(block.timestamp + 1 days);
        escrow.finalize(instrumentId);
        escrow.pause();
        uint256 buyerBefore = token.balanceOf(taker);
        uint256 sellerBefore = token.balanceOf(maker);
        (uint256 paidBuyer, uint256 paidSeller) = escrow.claim(orderHash);
        assertEq(paidBuyer, 4000);
        assertEq(paidSeller, 6050);
        uint256 buyerAfter = token.balanceOf(taker);
        uint256 sellerAfter = token.balanceOf(maker);
        assertEq(buyerAfter - buyerBefore, 4000);
        assertEq(sellerAfter - sellerBefore, 6050);
        (uint256 againBuyer, uint256 againSeller) = escrow.claim(orderHash);
        assertEq(againBuyer, 0);
        assertEq(againSeller, 0);
        assertEq(token.balanceOf(taker), buyerAfter);
        assertEq(token.balanceOf(maker), sellerAfter);
        assertGe(token.balanceOf(address(escrow)), escrow.outstandingMaxPayout());
    }

    function test_replayedSignatureReverts() public {
        SwitchboardEscrow.Order memory order = _order(instrumentId, 4, 3, 1000, 3);
        bytes memory signature = _sign(order);
        vm.prank(taker);
        escrow.fill(order, signature);
        vm.prank(taker);
        vm.expectRevert(SwitchboardEscrow.Replay.selector);
        escrow.fill(order, signature);
    }

    function test_invalidOracleAndChallengeWindow() public {
        vm.prank(maker);
        vm.expectRevert(SwitchboardEscrow.InvalidOracle.selector);
        escrow.proposeResult(instrumentId, 1);

        vm.expectRevert(SwitchboardEscrow.InvalidOracle.selector);
        escrow.proposeResult(instrumentId, 1001);

        escrow.proposeResult(instrumentId, 10);
        vm.warp(block.timestamp + 1 days - 1);
        vm.expectRevert(SwitchboardEscrow.ChallengeWindowOpen.selector);
        escrow.finalize(instrumentId);

        escrow.challenge(instrumentId);
        vm.warp(block.timestamp + 1);
        vm.expectRevert(SwitchboardEscrow.Challenged.selector);
        escrow.finalize(instrumentId);
    }

    function test_badSignatureAndPauseAndImmutableInstrument() public {
        SwitchboardEscrow.Order memory order = _order(instrumentId, 2, 2, 1000, 4);
        bytes32 digest = escrow.hashOrder(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xB0B, digest);
        vm.prank(taker);
        vm.expectRevert(SwitchboardEscrow.BadSignature.selector);
        escrow.fill(order, abi.encodePacked(r, s, v));

        bytes memory signature = _sign(order);
        escrow.pause();
        vm.prank(taker);
        vm.expectRevert(SwitchboardEscrow.Paused.selector);
        escrow.fill(order, signature);
        escrow.unpause();

        vm.expectRevert(SwitchboardEscrow.InstrumentImmutable.selector);
        escrow.listInstrument(instrumentId, 1, uint64(block.timestamp + 1 days));
    }

    function test_eventsForLockFillSettleClaim() public {
        vm.recordLogs();
        bytes32 orderHash = _fill(instrumentId, 1, 2, 1000, 5);
        escrow.proposeResult(instrumentId, 0);
        vm.warp(block.timestamp + 1 days);
        escrow.finalize(instrumentId);
        escrow.claim(orderHash);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertTrue(_saw(logs, keccak256("Locked(bytes32,address,uint256)")));
        assertTrue(_saw(logs, keccak256("Filled(bytes32,address,address,uint256,uint256)")));
        assertTrue(_saw(logs, keccak256("Settled(bytes32,uint256)")));
        assertTrue(_saw(logs, keccak256("Claimed(bytes32,address,uint256)")));
    }

    function _fill(bytes32 id, uint256 qty, uint256 price, uint256 maxPay, uint256 nonce) internal returns (bytes32 orderHash) {
        SwitchboardEscrow.Order memory order = _order(id, qty, price, maxPay, nonce);
        bytes memory signature = _sign(order);
        vm.prank(taker);
        orderHash = escrow.fill(order, signature);
    }

    function _order(bytes32 id, uint256 qty, uint256 price, uint256 maxPay, uint256 nonce)
        internal
        view
        returns (SwitchboardEscrow.Order memory)
    {
        return SwitchboardEscrow.Order({
            maker: maker,
            taker: address(0),
            instrumentId: id,
            makerIsLong: false,
            quantity: qty,
            pricePerUnit: price,
            maxPayoutPerUnit: maxPay,
            nonce: nonce,
            expiry: block.timestamp + 2 days
        });
    }

    function _sign(SwitchboardEscrow.Order memory order) internal view returns (bytes memory) {
        bytes32 digest = escrow.hashOrder(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _saw(Vm.Log[] memory logs, bytes32 topic0) internal pure returns (bool) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == topic0) return true;
        }
        return false;
    }
}

contract SolvencyHandler {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    SwitchboardEscrow internal escrow;
    uint256 internal makerPk = 0xA11CE;
    address internal maker;
    bytes32 internal instrumentId;
    uint256 internal nonce = 1;

    constructor(SwitchboardEscrow escrow_, bytes32 instrumentId_) {
        escrow = escrow_;
        instrumentId = instrumentId_;
        maker = vm.addr(makerPk);
    }

    function fillSmall(uint96 qtyRaw, uint96 priceRaw) external {
        uint256 qty = qtyRaw % 5 + 1;
        uint256 price = priceRaw % 10 + 1;
        if (escrow.freeBalance(maker) < qty * 100) return;
        if (escrow.freeBalance(address(this)) < qty * price) return;
        nonce += 1;
        SwitchboardEscrow.Order memory order = SwitchboardEscrow.Order({
            maker: maker,
            taker: address(0),
            instrumentId: instrumentId,
            makerIsLong: false,
            quantity: qty,
            pricePerUnit: price,
            maxPayoutPerUnit: 100,
            nonce: nonce,
            expiry: block.timestamp + 30 days
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, escrow.hashOrder(order));
        try escrow.fill(order, abi.encodePacked(r, s, v)) {} catch {}
    }
}

contract SwitchboardEscrowInvariantTest is Test {
    MockERC20 internal token;
    SwitchboardEscrow internal escrow;
    SolvencyHandler internal handler;

    function setUp() public {
        token = new MockERC20();
        escrow = new SwitchboardEscrow(address(this), address(this), token);
        bytes32 instrumentId = keccak256("invariant");
        escrow.listInstrument(instrumentId, 100, uint64(block.timestamp + 365 days));
        handler = new SolvencyHandler(escrow, instrumentId);
        address maker = vm.addr(0xA11CE);
        token.mint(maker, 1_000_000);
        token.mint(address(handler), 1_000_000);
        vm.prank(maker);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(maker);
        escrow.deposit(500_000);
        vm.prank(address(handler));
        token.approve(address(escrow), type(uint256).max);
        vm.prank(address(handler));
        escrow.deposit(500_000);

        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = SolvencyHandler.fillSmall.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_collateralCoversOutstandingMaxPayout() public view {
        assertGe(token.balanceOf(address(escrow)), escrow.outstandingMaxPayout());
        assertGe(escrow.accountedAssets(), escrow.outstandingMaxPayout());
    }
}
