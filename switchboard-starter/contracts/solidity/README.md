# SwitchboardEscrow

Foundry project for one fully collateralized escrow. Compiler: solc 0.8.24 (pinned in `foundry.toml`), optimizer 200 runs. Forge 1.0.0.

```shell
forge test
forge build
```

`script/Deploy.s.sol` can construct the contract in a local simulation. Do not pass `--broadcast`. This tree has no deployed address and no transaction hash.

ABI JSON is exported at `../abi/SwitchboardEscrow.json`.
