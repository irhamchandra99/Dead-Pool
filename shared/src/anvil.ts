import { toHex, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";

/** Anvil's public dev mnemonic. Local-only keys; never use them on a real network. */
export const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

/** Start anvil with `--accounts 20` so all of these are funded. */
export const ANVIL_ACCOUNTS = 20;

/**
 * Dev keys derived from the anvil mnemonic.
 * Roles: 0 deployer/organizer · 1 judge · 2 treasury · 3 sponsor · 4–19 teams.
 */
export const ANVIL_KEYS: Hex[] = Array.from({ length: ANVIL_ACCOUNTS }, (_, i) =>
  toHex(mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: i }).getHdKey().privateKey!),
);

export const ANVIL_CHAIN_ID = 31337;
