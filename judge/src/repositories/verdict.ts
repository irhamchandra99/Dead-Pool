import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256, toBytes, type Hex } from "viem";
import type { VerdictRecord } from "../types";

export interface StoredVerdict {
  /** The exact bytes that were hashed. */
  text: string;
  /** keccak256(text): the reasonHash stored on-chain. */
  hash: Hex;
  location: string;
}

/** Where the judge's full verdict files are kept. */
export interface VerdictRepository {
  /** Serializes the record. Does not persist; call save() once the verdict is final. */
  serialize(record: VerdictRecord): StoredVerdict;
  save(record: VerdictRecord): StoredVerdict;
  get(poolId: number, teamId: number): string | null;
}

function serialize(record: VerdictRecord, location: string): StoredVerdict {
  const text = `${JSON.stringify(record, null, 2)}\n`;
  return { text, hash: keccak256(toBytes(text)), location };
}

export class FileVerdictRepository implements VerdictRepository {
  constructor(private readonly dir: string) {}

  private path(poolId: number, teamId: number) {
    return resolve(this.dir, `${poolId}-${teamId}.json`);
  }

  serialize(record: VerdictRecord) {
    return serialize(record, this.path(record.poolId, record.teamId));
  }

  save(record: VerdictRecord) {
    const stored = this.serialize(record);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(stored.location, stored.text);
    return stored;
  }

  get(poolId: number, teamId: number) {
    const p = this.path(poolId, teamId);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  }
}

export class InMemoryVerdictRepository implements VerdictRepository {
  private store = new Map<string, string>();

  serialize(record: VerdictRecord) {
    return serialize(record, `memory:${record.poolId}-${record.teamId}`);
  }

  save(record: VerdictRecord) {
    const stored = this.serialize(record);
    this.store.set(`${record.poolId}-${record.teamId}`, stored.text);
    return stored;
  }

  get(poolId: number, teamId: number) {
    return this.store.get(`${poolId}-${teamId}`) ?? null;
  }
}
