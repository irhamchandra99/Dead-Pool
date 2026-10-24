import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Nav } from "@/components/Nav";
import { PoolView } from "@/components/PoolView";
import { appChain } from "@/lib/config";
import { samplePool } from "@/lib/mock";
import { publicConfig } from "@/lib/config";
import { contractAddress, demoPoolId, ownPoolId, poolStartBlock, readPool } from "@/lib/read";

export const dynamic = "force-dynamic";

export default async function PoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guide?: string }>;
}) {
  const { id } = await params;
  const guide = (await searchParams).guide === "1";
  const sample = id === "sample";
  const pool = sample ? samplePool() : /^\d+$/.test(id) ? await readPool(Number(id)) : null;

  return (
    <>
      <Nav />
      {pool ? (
        <>
          {sample ? null : <AutoRefresh />}
          <PoolView
            pool={pool}
            sample={sample}
            demo={!sample && publicConfig.demoMode && pool.id !== ownPoolId()}
            guide={guide}
            fromBlock={poolStartBlock(pool.id)}
            latestDemoId={demoPoolId()}
          />
        </>
      ) : (
        <main className="wrap" style={{ padding: "96px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 48, letterSpacing: "-0.03em" }}>Nothing buried here yet.</h1>
          <p style={{ color: "var(--mist)", maxWidth: 620 }}>
            {contractAddress()
              ? `This pool doesn’t exist, or ${appChain.name} isn’t reachable right now.`
              : "No DeadPool contract is configured. Deploy it and set NEXT_PUBLIC_DEAD_POOL_ADDRESS (or run the seed script)."}
          </p>
          <Link href="/" className="btn btn-ghost" style={{ alignSelf: "flex-start" }}>
            Back home
          </Link>
        </main>
      )}
    </>
  );
}
