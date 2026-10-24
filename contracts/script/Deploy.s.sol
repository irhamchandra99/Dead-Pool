// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DeadPool} from "../src/DeadPool.sol";

/// Usage:
///   forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract Deploy is Script {
    function run() external returns (DeadPool dp) {
        vm.startBroadcast();
        dp = new DeadPool();
        vm.stopBroadcast();
        console.log("DeadPool deployed at", address(dp));
    }
}
