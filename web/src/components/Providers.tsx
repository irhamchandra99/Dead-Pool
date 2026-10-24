"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createConfig, http, injected, WagmiProvider } from "wagmi";
import { appChain, publicConfig } from "@/lib/config";

const wagmiConfig = createConfig({
  chains: [appChain],
  connectors: [injected()],
  // appChain is picked at runtime from NEXT_PUBLIC_CHAIN_ID, so the transport map can't be typed per chain.
  transports: { [appChain.id]: http(publicConfig.rpcUrl) } as never,
  pollingInterval: appChain.id === 31337 ? 250 : 1000,
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
