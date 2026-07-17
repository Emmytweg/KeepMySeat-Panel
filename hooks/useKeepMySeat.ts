import { useState } from "react";
import {
  monadTestnet,
  publicClient,
  getWalletClient,
  CONTRACT_ADDRESS,
} from "../config/web3";
import { decodeErrorResult } from "viem";

// Paste the exact ABI JSON copied from the Remix compiler tab here
const CONTRACT_ABI = [
  {
    inputs: [{ internalType: "string", name: "_taskId", type: "string" }],
    name: "lockTask",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "string", name: "_taskId", type: "string" }],
    name: "getTaskStatus",
    outputs: [
      { internalType: "address", name: "lockedBy", type: "address" },
      { internalType: "uint256", name: "lockedAt", type: "uint256" },
      { internalType: "bool", name: "isLocked", type: "bool" },
      { internalType: "uint256", name: "expiresAt", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const; // 'as const' is critical for viem's automatic TypeScript type inference!

export function useKeepMySeat() {
  const [loading, setLoading] = useState(false);

  // --- READ FUNCTION ---

  const getTaskStatus = async (taskId: string) => {
    // Guard clause: Ensure we have an address and valid ABI before attempting the call
    if (!CONTRACT_ADDRESS || !CONTRACT_ABI) {
      console.error("Missing contract configuration parameters.");
      return { isLocked: false, lockedBy: null };
    }

    try {
      const data = await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: "getTaskStatus",
        args: [taskId], // Double check that taskId is exactly what the contract expects!
      });

      // ABI order: lockedBy, lockedAt, isLocked, expiresAt
      if (data && Array.isArray(data)) {
        return {
          lockedBy: data[0] ?? null,
          lockedAt: data[1] ?? null,
          isLocked: Boolean(data[2]),
          expiresAt: data[3] ?? null,
        };
      }

      return { isLocked: false, lockedBy: null };
    } catch (error) {
      // Catching the DataView/Contract Error gracefully so the UI keeps running
      console.warn(
        `[Viem Read Error] Failed fetching status for task ${taskId}:`,
        error,
      );

      // Return a default structural fallback state so app/page.tsx doesn't break
      return {
        isLocked: false,
        lockedBy: null,
        rpcError: true, // Flag this so your UI can know the contract connection is offline
      };
    }
  };

  // --- WRITE FUNCTION ---
  const lockTask = async (taskId: string, userAddress: `0x${string}`) => {
    setLoading(true);
    const walletClient = getWalletClient();

    if (!walletClient) {
      setLoading(false);
      throw new Error("MetaMask is not installed or connected.");
    }

    try {
      const currentChainId = await walletClient.getChainId();

      if (currentChainId !== monadTestnet.id) {
        await walletClient.switchChain({ id: monadTestnet.id });
      }

      // Prepare the contract transaction parameters
      const { request } = await publicClient.simulateContract({
        account: userAddress,
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "lockTask",
        args: [taskId],
      });

      // Broadcast and sign the transaction via MetaMask
      const hash = await walletClient.writeContract(request);

      // Wait for Monad to mine the block (resolves incredibly fast!)
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setLoading(false);
      return receipt;
    } catch (err: any) {
      setLoading(false);

      // Extract and decode custom contract errors (Unauthorized, TaskAlreadyLocked, etc.)
      if (err.data || err.error?.data) {
        const errorData = err.data || err.error.data;
        try {
          const decodedError = decodeErrorResult({
            abi: CONTRACT_ABI,
            data: errorData,
          });
          throw new Error(`Contract reverted: ${decodedError.errorName}`);
        } catch {
          throw new Error(err.message || "Transaction failed");
        }
      }
      throw err;
    }
  };

  return { lockTask, getTaskStatus, loading };
}
