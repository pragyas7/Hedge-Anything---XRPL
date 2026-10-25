// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// Fully collateralized bounded-payout escrow. No function pays more than quantity * listed max payout.
contract SwitchboardEscrow {
    error Paused();
    error NotOwner();
    error InvalidOracle();
    error UnknownInstrument();
    error InstrumentImmutable();
    error UnboundedPayout();
    error Expired();
    error Replay();
    error BadSignature();
    error InsufficientCollateral();
    error NotFilled();
    error NotFinalized();
    error ChallengeWindowOpen();
    error Challenged();
    error ZeroAmount();
    error TakerNotAllowed();
    error TransferFailed();

    event Locked(bytes32 indexed orderHash, address indexed account, uint256 amount);
    event Filled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 quantity, uint256 maxPayout);
    event Settled(bytes32 indexed instrumentId, uint256 payoutPerUnit);
    event Claimed(bytes32 indexed orderHash, address indexed account, uint256 amount);
    event ResultProposed(bytes32 indexed instrumentId, uint256 payoutPerUnit, uint256 challengeDeadline);
    event ResultChallenged(bytes32 indexed instrumentId, address indexed challenger);
    event InstrumentListed(bytes32 indexed instrumentId, uint256 maxPayoutPerUnit, uint64 expiry);

    struct Instrument {
        uint256 maxPayoutPerUnit;
        uint64 expiry;
        bool listed;
    }

    struct Order {
        address maker;
        address taker;
        bytes32 instrumentId;
        bool makerIsLong;
        uint256 quantity;
        uint256 pricePerUnit;
        uint256 maxPayoutPerUnit;
        uint256 nonce;
        uint256 expiry;
    }

    struct Position {
        address maker;
        address taker;
        bytes32 instrumentId;
        bool makerIsLong;
        uint256 quantity;
        uint256 pricePerUnit;
        uint256 maxPayoutPerUnit;
        uint256 sellerLocked;
        uint256 premiumLocked;
        bool filled;
        bool claimed;
    }

    struct Proposal {
        uint256 payoutPerUnit;
        uint256 proposedAt;
        bool exists;
        bool challenged;
        bool finalized;
    }

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,address taker,bytes32 instrumentId,bool makerIsLong,uint256 quantity,uint256 pricePerUnit,uint256 maxPayoutPerUnit,uint256 nonce,uint256 expiry)"
    );
    uint256 public constant CHALLENGE_WINDOW = 1 days;

    IERC20 public immutable collateral;
    address public owner;
    address public oracle;
    bool public paused;
    uint256 public outstandingMaxPayout;
    uint256 public totalFree;
    uint256 public totalLocked;

    mapping(bytes32 => Instrument) public instruments;
    mapping(address => uint256) public freeBalance;
    mapping(address => mapping(uint256 => bool)) public usedNonce;
    mapping(bytes32 => Position) public positions;
    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => uint256) public finalizedPayoutPerUnit;
    mapping(bytes32 => bool) public isFinalized;

    bytes32 private immutable DOMAIN_SEPARATOR;

    constructor(address owner_, address oracle_, IERC20 collateral_) {
        if (owner_ == address(0) || oracle_ == address(0) || address(collateral_) == address(0)) revert ZeroAmount();
        owner = owner_;
        oracle = oracle_;
        collateral = collateral_;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("SwitchboardEscrow")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    function pause() external onlyOwner {
        paused = true;
    }

    function unpause() external onlyOwner {
        paused = false;
    }

    function listInstrument(bytes32 instrumentId, uint256 maxPayoutPerUnit, uint64 expiry) external onlyOwner {
        if (instruments[instrumentId].listed) revert InstrumentImmutable();
        if (maxPayoutPerUnit == 0 || expiry == 0) revert UnboundedPayout();
        instruments[instrumentId] = Instrument(maxPayoutPerUnit, expiry, true);
        emit InstrumentListed(instrumentId, maxPayoutPerUnit, expiry);
    }

    function deposit(uint256 amount) external whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        _pull(msg.sender, amount);
        freeBalance[msg.sender] += amount;
        totalFree += amount;
    }

    function withdraw(uint256 amount) external {
        if (amount == 0 || freeBalance[msg.sender] < amount) revert InsufficientCollateral();
        freeBalance[msg.sender] -= amount;
        totalFree -= amount;
        _push(msg.sender, amount);
    }

    function hashOrder(Order calldata order) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                order.taker,
                order.instrumentId,
                order.makerIsLong,
                order.quantity,
                order.pricePerUnit,
                order.maxPayoutPerUnit,
                order.nonce,
                order.expiry
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function fill(Order calldata order, bytes calldata signature) external whenNotPaused returns (bytes32 orderHash) {
        if (order.quantity == 0 || order.pricePerUnit == 0) revert ZeroAmount();
        if (msg.sender == order.maker) revert TakerNotAllowed();
        if (block.timestamp > order.expiry) revert Expired();
        if (order.taker != address(0) && order.taker != msg.sender) revert TakerNotAllowed();
        Instrument storage inst = instruments[order.instrumentId];
        if (!inst.listed) revert UnknownInstrument();
        if (block.timestamp > inst.expiry) revert Expired();
        if (order.maxPayoutPerUnit != inst.maxPayoutPerUnit || order.maxPayoutPerUnit == 0) revert UnboundedPayout();
        if (usedNonce[order.maker][order.nonce]) revert Replay();

        orderHash = hashOrder(order);
        if (_recover(orderHash, signature) != order.maker) revert BadSignature();

        uint256 maxPayout = order.quantity * order.maxPayoutPerUnit;
        uint256 premium = order.quantity * order.pricePerUnit;
        address seller = order.makerIsLong ? msg.sender : order.maker;
        address buyer = order.makerIsLong ? order.maker : msg.sender;
        if (freeBalance[seller] < maxPayout || freeBalance[buyer] < premium) revert InsufficientCollateral();

        usedNonce[order.maker][order.nonce] = true;
        freeBalance[seller] -= maxPayout;
        freeBalance[buyer] -= premium;
        totalFree -= maxPayout + premium;
        totalLocked += maxPayout + premium;
        outstandingMaxPayout += maxPayout;

        positions[orderHash] = Position({
            maker: order.maker,
            taker: msg.sender,
            instrumentId: order.instrumentId,
            makerIsLong: order.makerIsLong,
            quantity: order.quantity,
            pricePerUnit: order.pricePerUnit,
            maxPayoutPerUnit: order.maxPayoutPerUnit,
            sellerLocked: maxPayout,
            premiumLocked: premium,
            filled: true,
            claimed: false
        });

        emit Locked(orderHash, seller, maxPayout);
        emit Locked(orderHash, buyer, premium);
        emit Filled(orderHash, order.maker, msg.sender, order.quantity, maxPayout);
    }

    function proposeResult(bytes32 instrumentId, uint256 payoutPerUnit) external whenNotPaused {
        if (msg.sender != oracle) revert InvalidOracle();
        Instrument storage inst = instruments[instrumentId];
        if (!inst.listed) revert InvalidOracle();
        if (payoutPerUnit > inst.maxPayoutPerUnit) revert InvalidOracle();
        Proposal storage proposal = proposals[instrumentId];
        if (proposal.finalized || proposal.exists) revert InvalidOracle();
        proposal.payoutPerUnit = payoutPerUnit;
        proposal.proposedAt = block.timestamp;
        proposal.exists = true;
        proposal.challenged = false;
        emit ResultProposed(instrumentId, payoutPerUnit, block.timestamp + CHALLENGE_WINDOW);
    }

    function challenge(bytes32 instrumentId) external {
        Proposal storage proposal = proposals[instrumentId];
        if (!proposal.exists || proposal.finalized) revert InvalidOracle();
        if (block.timestamp >= proposal.proposedAt + CHALLENGE_WINDOW) revert ChallengeWindowOpen();
        proposal.challenged = true;
        emit ResultChallenged(instrumentId, msg.sender);
    }

    function finalize(bytes32 instrumentId) external {
        Proposal storage proposal = proposals[instrumentId];
        if (!proposal.exists || proposal.finalized) revert InvalidOracle();
        if (proposal.challenged) revert Challenged();
        if (block.timestamp < proposal.proposedAt + CHALLENGE_WINDOW) revert ChallengeWindowOpen();
        proposal.finalized = true;
        isFinalized[instrumentId] = true;
        finalizedPayoutPerUnit[instrumentId] = proposal.payoutPerUnit;
        emit Settled(instrumentId, proposal.payoutPerUnit);
    }

    /// Second call is a no-op so a retried claim cannot pay twice.
    function claim(bytes32 orderHash) external returns (uint256 paidBuyer, uint256 paidSeller) {
        Position storage pos = positions[orderHash];
        if (!pos.filled) revert NotFilled();
        if (!isFinalized[pos.instrumentId]) revert NotFinalized();
        if (pos.claimed) return (0, 0);
        pos.claimed = true;

        uint256 payout = pos.quantity * finalizedPayoutPerUnit[pos.instrumentId];
        if (payout > pos.sellerLocked) revert UnboundedPayout();
        address seller = pos.makerIsLong ? pos.taker : pos.maker;
        address buyer = pos.makerIsLong ? pos.maker : pos.taker;
        uint256 toSeller = (pos.sellerLocked - payout) + pos.premiumLocked;
        uint256 release = pos.sellerLocked + pos.premiumLocked;
        totalLocked -= release;
        outstandingMaxPayout -= pos.sellerLocked;
        if (payout > 0) {
            _push(buyer, payout);
            emit Claimed(orderHash, buyer, payout);
        }
        if (toSeller > 0) {
            _push(seller, toSeller);
            emit Claimed(orderHash, seller, toSeller);
        }
        return (payout, toSeller);
    }

    function accountedAssets() external view returns (uint256) {
        return totalFree + totalLocked;
    }

    function _pull(address from, uint256 amount) private {
        if (!collateral.transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _push(address to, uint256 amount) private {
        if (!collateral.transfer(to, amount)) revert TransferFailed();
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := shr(248, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert BadSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
        return signer;
    }
}
