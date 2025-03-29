import React from 'react';
import { createRoot } from 'react-dom/client';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import App from './App';

const network = WalletAdapterNetwork.Mainnet;
const endpoint = 'Replace RPC'; //REPLACE RPC
const wallets = [new PhantomWalletAdapter(network)];

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <ConnectionProvider endpoint={endpoint}>
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        <App />
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
);