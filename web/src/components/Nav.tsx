import Link from "next/link";
import { publicConfig } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";
import { Tombstone } from "./Icons";

export function Nav() {
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="brand" aria-label="Dead Pool home">
          <span style={{ color: "var(--violet)", display: "inline-flex" }}>
            <Tombstone size={24} />
          </span>
          Dead Pool
        </Link>
        {/* The demo runs every action through the judge API; no wallet needed. */}
        {publicConfig.demoMode ? null : <ConnectButton />}
      </div>
    </header>
  );
}
