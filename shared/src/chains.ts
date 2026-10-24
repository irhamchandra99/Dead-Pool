import { defineChain } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
  testnet: true,
});

/** Local anvil node used for development and the end-to-end proof. Same currency label as Monad. */
export const localMonad = defineChain({
  id: 31337,
  name: "Local (anvil)",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

export const chainsById = {
  [monadTestnet.id]: monadTestnet,
  [localMonad.id]: localMonad,
} as const;

export function chainFor(id: number) {
  const chain = chainsById[id as keyof typeof chainsById];
  if (!chain) throw new Error(`Unsupported chain id ${id}`);
  return chain;
}
