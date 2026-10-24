// Deploys DeadPool and records its address in .deployments/<chainId>.json.
import { deadPoolAbi, deadPoolBytecode } from "@deadpool/shared";
import { encodeDeployData } from "viem";
import { connect, key, saveDeployment } from "./env";

const { chain, publicClient, isLocal, wallet } = await connect();
const deployer = wallet(key("DEPLOYER_PRIVATE_KEY", 0, isLocal));

// Explicit gas limit, estimated by address (see seed.ts): Monad bills the limit.
const gas = await publicClient.estimateGas({ account: deployer.account.address, data: encodeDeployData({ abi: deadPoolAbi, bytecode: deadPoolBytecode }) });
const hash = await deployer.deployContract({ abi: deadPoolAbi, bytecode: deadPoolBytecode, gas: (gas * 6n) / 5n });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (!receipt.contractAddress) throw new Error("Deployment failed");

const file = saveDeployment(chain.id, {
  address: receipt.contractAddress,
  deployBlock: Number(receipt.blockNumber),
  deployedAt: new Date().toISOString(),
  chain: chain.name,
});
console.log(`DeadPool deployed on ${chain.name} at ${receipt.contractAddress}`);
console.log(`Saved ${file}`);
