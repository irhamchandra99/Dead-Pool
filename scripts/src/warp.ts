// Local only: moves anvil's clock forward. Usage: pnpm --filter @deadpool/scripts warp <seconds>
import { createTestClient, http } from "viem";
import { localMonad } from "@deadpool/shared";
import { rpcUrl } from "./env";

const seconds = Number(process.argv[2] ?? "0");
const client = createTestClient({ chain: localMonad, mode: "anvil", transport: http(rpcUrl) });
await client.increaseTime({ seconds });
await client.mine({ blocks: 1 });
console.log(`Warped ${seconds}s`);
