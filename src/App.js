import React, { useState, useEffect, useRef } from 'react';
import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getAccount,
  createHarvestWithheldTokensToMintInstruction,
  createWithdrawWithheldTokensFromMintInstruction,
  getOrCreateAssociatedTokenAccount,
  createBurnInstruction,
} from '@solana/spl-token';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Buffer } from 'buffer';
import bs58 from 'bs58'; // Add this import

// Polyfill Buffer globally
window.Buffer = window.Buffer || Buffer;

function App() {
  const [status, setStatus] = useState('');
  const [accountsWithFees, setAccountsWithFees] = useState([]);
  const [tokenMintAddress, setTokenMintAddress] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [isPaused, setIsPaused] = useState(true);
  const [automationTime, setAutomationTime] = useState(5); // Default to 5 minutes
  const intervalRef = useRef(null);

  const connection = new Connection('PASTE RPC', 'confirmed'); // Change RPC

  useEffect(() => {
    if (!isPaused) {
      const intervalTime = automationTime * 60000; // Convert minutes to milliseconds
      intervalRef.current = setInterval(async () => {
        await fetchAccountsWithFees();
        await claimAndBurnFees();
      }, intervalTime);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPaused, automationTime]);

  const fetchAccountsWithFees = async () => {
    if (!privateKey || !tokenMintAddress) {
      setStatus('Please enter both private key and token mint address.');
      return;
    }

    try {
      setStatus('Fetching accounts...');
      const mintPublicKey = new PublicKey(tokenMintAddress);
      // Decode base58 private key
      const decodedKey = bs58.decode(privateKey);
      if (decodedKey.length !== 64) {
        throw new Error(`Invalid private key size. Expected 64 bytes, got ${decodedKey.length}`);
      }
      const keypair = Keypair.fromSecretKey(decodedKey);

      let mint;
      try {
        mint = await getMint(connection, mintPublicKey, 'confirmed', TOKEN_2022_PROGRAM_ID);
        console.log('Mint fetched:', mint.address.toBase58());
      } catch (error) {
        setStatus('Error: Invalid mint address or not a Token-2022 mint.');
        console.error('Mint fetch failed:', error.message);
        return;
      }

      if (mint.withheldAuthority) {
        if (!mint.withheldAuthority.equals(keypair.publicKey)) {
          setStatus('Private key does not match the withdraw authority for this mint.');
          console.log('Withheld authority:', mint.withheldAuthority.toBase58());
          return;
        }
      } else {
        console.log('Withheld authority: None');
        setStatus('Warning: No withheld authority set for this mint. You may not be able to withdraw fees.');
      }

      const accounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
        filters: [{ memcmp: { offset: 0, bytes: mintPublicKey.toBase58() } }],
      });
      console.log(`Found ${accounts.length} token accounts.`);

      const accountsWithFees = [];
      for (const account of accounts) {
        try {
          const accountInfo = await getAccount(connection, account.pubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
          console.log(`Account ${account.pubkey.toBase58()} - Amount: ${accountInfo.amount.toString()}`);
          accountsWithFees.push(account.pubkey.toBase58());
        } catch (error) {
          console.error(`Failed to fetch account ${account.pubkey.toBase58()}:`, error.message);
        }
      }

      setAccountsWithFees(accountsWithFees);
      if (accountsWithFees.length === 0) {
        setStatus('No token accounts found for this mint.');
      } else {
        setStatus(`Found ${accountsWithFees.length} potential accounts with fees.`);
      }
    } catch (error) {
      setStatus('Error fetching accounts: ' + error.message);
      console.error('Error in fetchAccountsWithFees:', error);
    }
  };

  const claimAndBurnFees = async () => {
    if (!privateKey || !tokenMintAddress) {
      setStatus('Please enter both private key and token mint address.');
      return;
    }
    if (accountsWithFees.length === 0) {
      setStatus('No accounts with fees to claim.');
      return;
    }

    try {
      setStatus('Preparing transaction...');
      const mintPublicKey = new PublicKey(tokenMintAddress);
      const decodedKey = bs58.decode(privateKey);
      if (decodedKey.length !== 64) {
        throw new Error(`Invalid private key size. Expected 64 bytes, got ${decodedKey.length}`);
      }
      const keypair = Keypair.fromSecretKey(decodedKey);

      const destinationAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        mintPublicKey,
        keypair.publicKey,
        false,
        'confirmed',
        {},
        TOKEN_2022_PROGRAM_ID
      );
      const destinationAccount = destinationAccountInfo.address;
      console.log('Destination account:', destinationAccount.toBase58());

      const transaction = new Transaction();

      const sourceAccounts = accountsWithFees.map((addr) => new PublicKey(addr));
      transaction.add(
        createHarvestWithheldTokensToMintInstruction(
          mintPublicKey,
          sourceAccounts,
          TOKEN_2022_PROGRAM_ID
        )
      );

      transaction.add(
        createWithdrawWithheldTokensFromMintInstruction(
          mintPublicKey,
          destinationAccount,
          keypair.publicKey,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      const signature = await connection.sendTransaction(transaction, [keypair]);
      await connection.confirmTransaction(signature, 'confirmed');
      setStatus('Fees claimed successfully! Transaction: ' + signature);

      // Burn the tokens received
      const burnTransaction = new Transaction();
      burnTransaction.add(
        createBurnInstruction(
          destinationAccount,
          mintPublicKey,
          keypair.publicKey,
          (await getAccount(connection, destinationAccount, 'confirmed', TOKEN_2022_PROGRAM_ID)).amount,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      const burnSignature = await connection.sendTransaction(burnTransaction, [keypair]);
      await connection.confirmTransaction(burnSignature, 'confirmed');
      setStatus('Tokens burned successfully! Transaction: ' + burnSignature);

      setAccountsWithFees([]);
    } catch (error) {
      setStatus('Error claiming and burning fees: ' + error.message);
      console.error('Error in claimAndBurnFees:', error);
    }
  };

  const claimFees = async () => {
    if (!privateKey || !tokenMintAddress) {
      setStatus('Please enter both private key and token mint address.');
      return;
    }
    if (accountsWithFees.length === 0) {
      setStatus('No accounts with fees to claim.');
      return;
    }

    try {
      setStatus('Preparing transaction...');
      const mintPublicKey = new PublicKey(tokenMintAddress);
      const decodedKey = bs58.decode(privateKey);
      if (decodedKey.length !== 64) {
        throw new Error(`Invalid private key size. Expected 64 bytes, got ${decodedKey.length}`);
      }
      const keypair = Keypair.fromSecretKey(decodedKey);

      const destinationAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        mintPublicKey,
        keypair.publicKey,
        false,
        'confirmed',
        {},
        TOKEN_2022_PROGRAM_ID
      );
      const destinationAccount = destinationAccountInfo.address;
      console.log('Destination account:', destinationAccount.toBase58());

      const transaction = new Transaction();

      const sourceAccounts = accountsWithFees.map((addr) => new PublicKey(addr));
      transaction.add(
        createHarvestWithheldTokensToMintInstruction(
          mintPublicKey,
          sourceAccounts,
          TOKEN_2022_PROGRAM_ID
        )
      );

      transaction.add(
        createWithdrawWithheldTokensFromMintInstruction(
          mintPublicKey,
          destinationAccount,
          keypair.publicKey,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      const signature = await connection.sendTransaction(transaction, [keypair]);
      await connection.confirmTransaction(signature, 'confirmed');
      setStatus('Fees claimed successfully! Transaction: ' + signature);

      setAccountsWithFees([]);
    } catch (error) {
      setStatus('Error claiming fees: ' + error.message);
      console.error('Error in claimFees:', error);
    }
  };

  const handlePauseResume = async () => {
    setIsPaused(!isPaused);
    if (isPaused) {
      console.log('Resuming auto claim and burn...');
    } else {
      console.log('Pausing auto claim and burn and performing manual claim and burn...');
      await fetchAccountsWithFees();
      console.log('Fetched accounts with fees.');
      await claimAndBurnFees();
      console.log('Claimed and burned fees.');
    }
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h1>Token Fee Claim</h1>
      <WalletMultiButton />
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Enter Token Mint Address"
          value={tokenMintAddress}
          onChange={(e) => setTokenMintAddress(e.target.value)}
          style={{ marginBottom: '10px', padding: '10px', width: '300px' }}
        />
        <input
          type="text"
          placeholder="Enter Private Key"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          style={{ marginBottom: '10px', padding: '10px', width: '300px' }}
        />
        <input
          type="number"
          placeholder="Automation Time (minutes)"
          value={automationTime}
          onChange={(e) => setAutomationTime(e.target.value)}
          style={{ marginBottom: '10px', padding: '10px', width: '300px' }}
        />
        <button onClick={fetchAccountsWithFees} style={{ marginBottom: '10px', padding: '10px', width: '300px' }}>
          Fetch Accounts with Fees
        </button>
        <button
          onClick={claimFees}
          disabled={accountsWithFees.length === 0}
          style={{ marginBottom: '10px', padding: '10px', width: '300px' }}
        >
          Claim Fees
        </button>
        <button
          onClick={claimAndBurnFees}
          disabled={accountsWithFees.length === 0}
          style={{ marginBottom: '10px', padding: '10px', width: '300px' }}
        >
          Claim and Burn Fees
        </button>
        <button
          onClick={handlePauseResume}
          style={{ padding: '10px', width: '300px' }}
        >
          {isPaused ? 'Resume' : 'Pause'} Auto Claim and Burn
        </button>
      </div>
      <p style={{ marginTop: '20px' }}>{status}</p>
      {accountsWithFees.length > 0 && (
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <h3>Accounts with Fees:</h3>
          <ul>
            {accountsWithFees.map((account) => (
              <li key={account}>{account}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;