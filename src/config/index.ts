// src/config/index.ts

import { cookieStorage, createStorage } from 'wagmi';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, sepolia } from '@reown/appkit/networks';
import type { Chain } from 'viem'; // ✅ Add this import

// Get projectId from https://dashboard.reown.com
export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  throw new Error('NEXT_PUBLIC_PROJECT_ID is not defined in .env.local');
}

// ✅ Add the explicit non-empty array type here
export const chains: [Chain, ...Chain[]] = [mainnet, sepolia];

// Set up the Wagmi Adapter (this is your wagmi config)
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
  projectId,
  networks: chains,
});

export const config = wagmiAdapter.wagmiConfig;