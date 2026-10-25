// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {SwitchboardEscrow} from "../src/SwitchboardEscrow.sol";
import {IERC20} from "../src/SwitchboardEscrow.sol";

/// Local simulation only. Do not pass --broadcast. No address or transaction hash is hardcoded.
contract DeployScript is Script {
    function run() external {
        address owner = vm.envOr("ESCROW_OWNER", address(uint160(1)));
        address oracle = vm.envOr("ESCROW_ORACLE", address(uint160(2)));
        address collateral = vm.envOr("ESCROW_COLLATERAL", address(uint160(3)));
        new SwitchboardEscrow(owner, oracle, IERC20(collateral));
    }
}
