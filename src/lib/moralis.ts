export async function fetchERC20Balances(wallet: string) {
  const res = await fetch(
    `https://deep-index.moralis.io/api/v2.2/${wallet}/erc20?chain=sepolia`,
    {
      headers: {
        "X-API-Key": process.env.NEXT_PUBLIC_MORALIS_API_KEY!,
      },
    }
  );
  return res.json();
}

export async function fetchNFTs(wallet: string) {
  const res = await fetch(
    `https://deep-index.moralis.io/api/v2.2/${wallet}/nft?chain=sepolia&format=decimal`,
    {
      headers: {
        "X-API-Key": process.env.NEXT_PUBLIC_MORALIS_API_KEY!,
      },
    }
  );
  return res.json();
}
