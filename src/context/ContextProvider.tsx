// context/ContextProvider.tsx
'use client';

import { wagmiAdapter, projectId, chains } from '../config/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit } from '@reown/appkit/react';
import React, { type ReactNode } from 'react';
import { cookieToInitialState, WagmiProvider, type Config } from 'wagmi';

// Set up React Query client
const queryClient = new QueryClient();

if (!projectId) throw new Error('Project ID is not defined');

// Define metadata for your dApp
const metadata = {
  name: 'Azuki Airdrop',
  description: 'Claim your Elemental Azuki Airdrop',
  url: 'https://your-dapp-url.com', // origin must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/37784886'],
};

// Create the Reown AppKit modal
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: chains,
  defaultNetwork: chains[0],
  metadata: metadata,
  features: {
    analytics: true,
  },
});

function ContextProvider({ children, cookies }: { children: ReactNode; cookies: string | null }) {
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies);

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

export default ContextProvider;