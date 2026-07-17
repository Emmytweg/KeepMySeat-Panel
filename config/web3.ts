import { createPublicClient, createWalletClient, custom, defineChain } from 'viem';

// Tell TypeScript that window.ethereum exists
declare global {
  interface Window {
    ethereum?: any;
  }
}
// Define Monad Testnet manually since it's an upcoming high-performance EVM
export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' },
  },
});

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

// 1. Public Client for lightning-fast read operations (getTaskStatus)
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: custom(typeof window !== 'undefined' && window.ethereum ? window.ethereum : { request: async () => [] }),
});

// 2. Wallet Client for write operations requiring MetaMask signatures (lockTask)
export const getWalletClient = () => {
  if (typeof window === 'undefined' || !window.ethereum) return null;
  return createWalletClient({
    chain: monadTestnet,
    transport: custom(window.ethereum),
  });
};