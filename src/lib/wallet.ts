import { BrowserProvider, type Eip1193Provider } from "ethers";

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      on?: (event: string, handler: (...args: never[]) => void) => void;
      removeListener?: (
        event: string,
        handler: (...args: never[]) => void,
      ) => void;
    };
    solana?: {
      isPhantom?: boolean;
      publicKey?: { toString(): string };
      connect(): Promise<{ publicKey: { toString(): string } }>;
      disconnect(): Promise<void>;
      signAndSendTransaction(tx: unknown): Promise<{ signature: string }>;
    };
  }
}

export type Chain = "ethereum" | "solana";

export type WalletState = {
  chain: Chain;
  address: string;
  /** Decimal chain id, Ethereum only. */
  chainId?: number;
};

export const hasMetaMask = () => typeof window !== "undefined" && !!window.ethereum;
export const hasPhantom = () =>
  typeof window !== "undefined" && !!window.solana?.isPhantom;

export async function connectEthereum(): Promise<WalletState> {
  if (!window.ethereum)
    throw new Error(
      "No Ethereum wallet found. Install MetaMask (or another EIP-1193 wallet) and reload.",
    );
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const net = await provider.getNetwork();
  return {
    chain: "ethereum",
    address: await signer.getAddress(),
    chainId: Number(net.chainId),
  };
}

export async function connectSolana(): Promise<WalletState> {
  if (!window.solana)
    throw new Error("No Solana wallet found. Install Phantom and reload.");
  const { publicKey } = await window.solana.connect();
  return { chain: "solana", address: publicKey.toString() };
}

export async function disconnectSolana() {
  try {
    await window.solana?.disconnect();
  } catch {
    /* wallet may not support programmatic disconnect */
  }
}

/**
 * Ethereum transactions come back from the SDK as `{ to, data, value, gasLimit }`,
 * ready to hand straight to a signer.
 */
export type EthTx = {
  to: string;
  data?: string;
  value?: string | bigint;
  gasLimit?: string | bigint;
};

export async function sendEthereumTx(tx: EthTx): Promise<string> {
  if (!window.ethereum) throw new Error("No Ethereum wallet found.");
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const res = await signer.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value ? BigInt(tx.value) : undefined,
    gasLimit: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
  });
  return res.hash;
}

/** Solana swaps come back as a VersionedTransaction that Phantom can sign directly. */
export async function sendSolanaTx(tx: unknown): Promise<string> {
  if (!window.solana) throw new Error("No Solana wallet found.");
  const { signature } = await window.solana.signAndSendTransaction(tx);
  return signature;
}

export const explorerTxUrl = (chain: Chain, hash: string) =>
  chain === "ethereum"
    ? `https://etherscan.io/tx/${hash}`
    : `https://solscan.io/tx/${hash}`;

export const explorerAddressUrl = (chain: Chain, address: string) =>
  chain === "ethereum"
    ? `https://etherscan.io/address/${address}`
    : `https://solscan.io/account/${address}`;

export const shortAddress = (a: string, size = 4) =>
  a.length <= size * 2 + 2 ? a : `${a.slice(0, size + 2)}…${a.slice(-size)}`;
