// import { Environment, FixedSide, Moonit } from '@moonit/sdk';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';
import axios from 'axios';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { BN } from "bn.js";

import {
  createSolanaRpc,
  createKeyPairSignerFromBytes,
} from "@solana/kit";
import { Bundle } from 'jito-ts/dist/sdk/block-engine/types';
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher';
import { AnchorProvider, Program, Provider } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";

import base58 from 'bs58';
import { BondingCurveAccount } from "./utils/bondingCurveAccount";

import { PumpFun, IDL } from "./idl/index";
import { publicKey } from '@coral-xyz/borsh';
import { error } from 'console';
const blockEngineUrl = "tokyo.mainnet.block-engine.jito.wtf"

const c = searcherClient(blockEngineUrl, undefined);

dotenv.config();

// Configuration
const SOLANA_RPC =
  process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const IS_DEVNET = process.env.IS_DEVNET === 'true';
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || '100'); // 1% default
const JITO_TIP_MULT = parseInt(process.env.JITO_TIP_MULT || '20');
const WALLETS_FILE = process.env.WALLETS_FILE || 'wallets.txt';
const PRIORITY_FEE_MICROLAMPORTS = parseInt(
  process.env.PRIORITY_FEE || '200000',
);

const MINIMUM_JITO_TIP = 1_000_000; // lamports
const NUMBER_TRANSACTIONS = 5;

// Jito endpoints
const JITO_ENDPOINTS = [
  // 'https://slc.mainnet.block-engine.jito.wtf/api/v1/bundles',
  // 'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
  // 'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
];

const solanaRpc = createSolanaRpc(process.env.SOLANA_RPC as string);

// Photon swap constants
const PHOTON_PROGRAM_ID = new PublicKey('BSfD6SHZigAfDWSjzD5Q41jw8LmKwtmjskPH9XW1mrRW');
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_FUN_FEE_RECIPIENT = new PublicKey('62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV');
const PHOTON_FEE_VAULT = new PublicKey('AVUCZyuT35YSuj4RH7fwiyPu82Djn2Hfg7y2ND2XcnZH');
const EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

export const global_mint = new PublicKey("p89evAyzjd9fphjJx7G3RFA48sbZdpGEppRcfRNpump")

export const FEE_RECEIPT = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
export const GLOBAL_VOLUME_ACCUMULATOR = new PublicKey("Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y") ;

export const GLOBAL_ACCOUNT_SEED = "global";
export const DEFAULT_COMMITMENT = "finalized";
export const MINT_AUTHORITY_SEED = "mint-authority";
export const BONDING_CURVE_SEED = "bonding-curve";
export const METADATA_SEED = "metadata";


// Initialize connection
const connection = new Connection(SOLANA_RPC, {
  commitment: 'processed',
  confirmTransactionInitialTimeout: 15000,
  wsEndpoint: SOLANA_RPC.replace('https', 'wss'),
});
const provider = new AnchorProvider(connection, new NodeWallet(new Keypair()), { commitment: 'processed' })
const program = new Program<PumpFun>(IDL, provider);

const getBondingCurvePDA = (mint: PublicKey) => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
    PUMP_FUN_PROGRAM_ID
  )[0];
}


const getBondingCurveAccount = async (
  mint: PublicKey,
  commitment = DEFAULT_COMMITMENT
) => {

  const tokenAccount = await connection.getAccountInfo(
    getBondingCurvePDA(mint),
    // @ts-ignore
    commitment
  );

  console.log("🚀  >>>>>>>>>>>>>>>> ", tokenAccount);
  if (!tokenAccount) {
    return null;
  }
  return BondingCurveAccount.fromBuffer(tokenAccount!.data);
}

export const getAssociatedTokenAccount = (ownerPubkey: PublicKey, mintPk: PublicKey): PublicKey => {
  return PublicKey.findProgramAddressSync(
    [
      ownerPubkey.toBytes(),
      TOKEN_PROGRAM_ID.toBytes(),
      // mintPk.toBytes(), // mint address
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

// // Initialize SDK for a specific wallet
// const initSdk = async (wallet: Keypair) => {
//   const moonit = new Moonit({
//     rpcUrl: SOLANA_RPC,
//     environment: IS_DEVNET ? Environment.DEVNET : Environment.MAINNET,
//     chainOptions: {
//       solana: { confirmOptions: { commitment: 'confirmed' } },
//     },
//   });

//   return moonit;
// };

// Utility: Create keypair from private key
function createKeypairFromBase58(privateKeyBase58: string): Keypair {
  const privateKeyUint8Array = bs58.decode(privateKeyBase58);
  const temp = Uint8Array.from(privateKeyUint8Array);
  return Keypair.fromSecretKey(temp);
}


// Load wallets from file
async function loadWallets() {
  const fileContent = fs.readFileSync(WALLETS_FILE, 'utf-8');
  const lines = fileContent
    .split('\n')
    .filter((line) => line.trim().length > 0);

  return lines.map((line, index) => {
    const [publicKey, privateKey, amount] = line.trim().split(',');
    return {
      number: index + 1,
      address: publicKey,
      privateKey: privateKey,
      amount: parseFloat(amount),
    };
  });
}

// Get Jito tip account
function getTipAccount() {
  const tipAccounts = [
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  ];
  const index = Math.floor(Math.random() * tipAccounts.length);
  return tipAccounts[index];
}

// // Create Jito tip transaction
// async function createJitoTipTransaction(
//   wallet: Keypair,
//   multiplier = JITO_TIP_MULT,
//   blockhash: string,
// ) {
//   const tipAccount = await getTipAccount();
//   const tipAmount = 0.001; // Fixed tip amount

//   if (isNaN(tipAmount) || tipAmount <= 0) {
//     throw new Error(`Invalid tip amount: ${tipAmount}`);
//   }

//   const tipTransaction = new VersionedTransaction(
//     new TransactionMessage({
//       payerKey: wallet.publicKey,
//       recentBlockhash: blockhash,
//       instructions: [
//         SystemProgram.transfer({
//           fromPubkey: wallet.publicKey,
//           toPubkey: new PublicKey(tipAccount),
//           lamports: Math.floor(tipAmount * 1_000_000_000), // Convert SOL to lamports
//         }),
//       ],
//     }).compileToV0Message(),
//   );

//   tipTransaction.sign([wallet]);
//   return SolanaSerializationService.serializeVersionedTransaction(
//     tipTransaction,
//   );
// }

// // Send Jito bundle
// async function sendBundle(transactionBundle: string[], endpoint: string) {
//   try {
//     const payload = {
//       jsonrpc: '2.0',
//       id: 1,
//       method: 'sendBundle',
//       params: [transactionBundle],
//     };

//     // const jitoApiKey = process.env.JITO_API_KEY;
//     // if (!jitoApiKey) {
//     //   throw new Error('JITO_API_KEY not found in environment variables');
//     // }

//     const response = await axios.post(endpoint, payload, {
//       headers: {
//         'Content-Type': 'application/json',
//         // Authorization: `Bearer ${jitoApiKey}`,
//       },
//     });

//     if (response.data && response.data.result) {
//       return response.data.result;
//     }
//     return null;
//   } catch (error) {
  //     console.error(`Error sending bundle to ${endpoint}:`, error.message);
  //     if (error.response) {
    //       console.error('Status:', error.response.status);
    //       console.error('Status text:', error.response.statusText);
    //       console.error(
      //         'Response data:',
      //         JSON.stringify(error.response.data, null, 2),
      //       );
      //     }
      //     return null;
//   }
// }

// Function to prepare and execute with retries
async function prepareAndExecuteWithRetry(
  wallet: any,
  tokenAddress: string,
  poolPubkey: PublicKey,
  amountInSol: number,
  priorityFee: number,
  estimatedPriceImpact: number,
  jitoTipMultiplier: number,
) {
  let attempt = 1;
  let lastError = null;

  while (true) {
    try {
      console.log(`\n=== Wallet ${wallet.number} - Attempt ${attempt} ===`);
      console.time("Buy Execution Time");
      // Phase 1: Prepare
      console.log('Preparing buy...');
      const prepared = await prepareBuy(
        wallet,
        tokenAddress,
        poolPubkey,
        amountInSol,
        priorityFee,
        estimatedPriceImpact,
      );
      console.log('✅  ', prepared);
      console.timeEnd("Buy Execution Time");
      console.log('✅ Buy prepared successfully');
      
      
      // Phase 2: Execute
      console.log('Executing buy...');
      const { blockhash } = await connection.getLatestBlockhash();
      const result = await executeBuy(
        wallet,
        prepared,
        blockhash,
        jitoTipMultiplier,
      );

      if (result.success) {
        console.log(`✅ Buy successful! TX: ${result.txid}`);
        // Keep retrying even after success
        console.log('Continuing to retry for better price...');
      } else {
        console.log(`❌ Buy failed: ${result.error}`);
      }

      

      // // Small delay between attempts
      // await new Promise((resolve) => setTimeout(resolve, 200));
      // attempt++;
    } catch (error) {
      console.error(`❌ Error in attempt ${attempt}:`, error.message);
      lastError = error;

      // If it's a fatal error, throw it
      if (
        error.message.includes('fatal') ||
        error.message.includes('critical')
      ) {
        throw error;
      }

      // Small delay before retry
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempt++;
    }
  }
}

// Function to prepare a buy
async function prepareBuy(
  wallet: any,
  tokenAddress: string,
  poolPubkey: PublicKey,
  amountInSol: number,
  priorityFee: number,
  estimatedPriceImpact: number,
) {
  try {
    console.log('1. Preparing Photon swap transaction...');
    const userKeypair = createKeypairFromBase58(wallet.privateKey);
    // console.log("🚀 >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>", new PublicKey(tokenAddress).public);
    const mintPubkey = new PublicKey(tokenAddress);

    // Convert SOL amount to lamports
    const solAmount = Math.floor(amountInSol * 1_000_000_000);

    // Create transaction
    const tx = new Transaction();
    const [associatedBondingCurvePDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("bonding_curve"),
        mintPubkey.toBuffer()
      ],
      program.programId
    );

    // const initTx = await program.methods
    //   .initialize()
    //   .accounts({
    //     associatedBondingCurve: associatedBondingCurvePDA,
    //     payer: userKeypair.publicKey,
    //     mint: mintPubkey,
    //     systemProgram: SystemProgram.programId,
    //   })
    //   .instruction();

    // tx.add(initTx);

    // Add priority fee instruction
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee
      }),
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 150_000
      })
    );

    // Get user's token account
    const userTokenAta = await getAssociatedTokenAddress(
      mintPubkey,
      userKeypair.publicKey
    );

    // Check if token account exists
    const accountInfo = await connection.getAccountInfo(userTokenAta);
    if (!accountInfo) {
      console.log('Adding ATA creation instruction');
      // initializedTokenAccount = true;;
      tx.add(createAssociatedTokenAccountInstruction(
        userKeypair.publicKey,
        userTokenAta,
        userKeypair.publicKey,
        mintPubkey
      ));
    }

    // Derive PDAs
    const [globalPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('global')],
      PUMP_FUN_PROGRAM_ID
    );

    const bondingCurveAta = await getAssociatedTokenAddress(mintPubkey, poolPubkey, true);

    // Get bonding curve account to find creator
    const bondingCurveAccount = await getBondingCurveAccount(mintPubkey);

    if (!bondingCurveAccount) {
      throw new Error("Bonding curve account not found");
    }

    const [creatorVault] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("creator-vault"),
        bondingCurveAccount.creator.toBuffer()
      ],
      PUMP_FUN_PROGRAM_ID
    );


    const seeds = [
      Buffer.from("user_volume_accumulator"),
      userKeypair.publicKey.toBuffer()
    ];
    const [USER_VOLUME_ACCUMULATOR] = PublicKey.findProgramAddressSync(
      seeds,
      PUMP_FUN_PROGRAM_ID
    );
    // const USER_VOLUME_ACCUMULATOR = getAssociatedTokenAddressSync(
    //   mintPubkey,
    //   userKeypair.publicKey
    // );

    // const USER_VOLUMN_ACCUMULATOR = await getAssociatedTokenAccount(userKeypair.publicKey, mintPubkey);
    // console.log("---- USER_VOLUMN_ACCUMULATOR :>>>>>>>>>>>>>> ", USER_VOLUMN_ACCUMULATOR);

    // const GLOBAL_VOLUME_ACCUMULATOR = await connection.getAccountInfo(poolPubkey);
    // console.log("---- GLOBAL_VOLUME_ACCUMULATOR :>>>>>>>>>>>>>> ", GLOBAL_VOLUME_ACCUMULATOR);
    // Prepare Photon swap instruction data
    const discriminator = Buffer.from('52e177e74e1d2d46', 'hex');
    const dataLayout = Buffer.alloc(32);
    dataLayout.writeBigUInt64LE(BigInt(0), 0);        // token_amount
    dataLayout.writeBigUInt64LE(BigInt(solAmount), 8);  // max_sol_cost
    dataLayout.writeBigUInt64LE(BigInt(1000), 24);    // slippage
    dataLayout.writeBigUInt64LE(BigInt(200_000), 24); // fee amount

    const instructionData = Buffer.concat([discriminator, dataLayout]);

    
    console.log("globalPda :> ", mintPubkey);
    const vaultPda = await getAssociatedTokenAccount(poolPubkey, mintPubkey);

    console.log("vaultPda :> ", vaultPda);


    console.log("globalPda: ", globalPda.toBase58())
    console.log("PUMP_FUN_FEE_RECIPIENT: ", PUMP_FUN_FEE_RECIPIENT.toBase58())
    console.log("mintPubkey: ", mintPubkey.toBase58())
    console.log("poolPubkey: ", poolPubkey.toBase58())
    console.log("bondingCurveAta: ", bondingCurveAta.toBase58())
    console.log("userTokenAta: ", userTokenAta.toBase58())
    console.log("userKeypair: ", userKeypair.publicKey.toBase58())
    console.log("SystemProgram: ", SystemProgram.programId.toBase58())
    console.log("TOKEN_PROGRAM_ID: ", TOKEN_PROGRAM_ID.toBase58())
    console.log("creatorVault: ", creatorVault.toBase58())
    console.log("EVENT_AUTHORITY: ", EVENT_AUTHORITY.toBase58())
    console.log("PUMP_FUN_PROGRAM_ID: ", PUMP_FUN_PROGRAM_ID.toBase58())
    console.log("GLOBAL_VOLUME_ACCUMULATOR: ", GLOBAL_VOLUME_ACCUMULATOR.toBase58())
    console.log("USER_VOLUME_ACCUMULATOR: ", USER_VOLUME_ACCUMULATOR.toBase58())

    // Create Photon instruction
    const photonInstruction = new TransactionInstruction({
      programId: PHOTON_PROGRAM_ID,
      keys: [
        { pubkey: globalPda, isSigner: false, isWritable: false },
        { pubkey: PUMP_FUN_FEE_RECIPIENT, isSigner: false, isWritable: true },
        { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: poolPubkey, isSigner: false, isWritable: true },
        { pubkey: bondingCurveAta, isSigner: false, isWritable: true },
        { pubkey: userTokenAta, isSigner: false, isWritable: true },
        { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: PHOTON_FEE_VAULT, isSigner: false, isWritable: true },
        { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: creatorVault, isSigner: false, isWritable: true },
        { pubkey: GLOBAL_VOLUME_ACCUMULATOR, isSigner: false, isWritable: true },
        { pubkey: USER_VOLUME_ACCUMULATOR, isSigner: false, isWritable: true }
      ],
      // accumulator
      data: instructionData
    });

    // Add Photon instruction
    tx.add(photonInstruction);

    // // Add BloxRoute fee
    // tx.add(
    //   SystemProgram.transfer({
    //     fromPubkey: userKeypair.publicKey,
    //     toPubkey: new PublicKey('7ks326H4LbMVaUC8nW5FpC5EoAf5eK5pf4Dsx4HDQLpq'),
    //     lamports: 600_000, // 0.06 SOL
    //   })
    // );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = userKeypair.publicKey;

    console.log("❌❌❌❌ >> ", await connection.simulateTransaction(tx));

    // throw error;

    // Sign transaction
    tx.sign(userKeypair);

    return {
      wallet,
      transaction: tx,
      priorityFee,
      slippage: SLIPPAGE_BPS / 100,
    };
  } catch (error) {
    console.error(`❌ Error preparing buy for wallet ${wallet.number}:`, error);
    throw error;
  }
}

// Add this helper function to get pool address
async function getPoolAddress(mintAddress: string): Promise<PublicKey> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`;
  try {
    const response = await axios.get(url);
    const data = response.data;
    const pairData = data?.pairs?.find((pair: any) => pair.dexId.includes("pumpfun"));

    if (!pairData) {
      throw new Error("No pumpfun pair found");
    }
    
    return new PublicKey(pairData.pairAddress);
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
}

// Function to execute a prepared buy
async function executeBuy(
  wallet: any,
  prepared: any,
  blockhash: string,
  jitoTipMultiplier: number,
) {
  try {
    const signWallet = createKeypairFromBase58(wallet.privateKey);
    // console.log('1. Creating Jito tip transaction...');
    // const jitoTipTransaction = await createJitoTipTransaction(
    //   createKeypairFromBase58(wallet.privateKey),
    //   jitoTipMultiplier,
    //   blockhash,
    // );
    console.log('✅ Jito tip transaction created successfully');

    // Step 3 - Get Recent Blockhash
    const { value: latestBlockhash } = await solanaRpc
      .getLatestBlockhash({ commitment: "confirmed" })
      .send();
    console.log(`✅ - Latest blockhash: ${latestBlockhash.blockhash}`);

    const jitoTipAddress = getTipAccount();
    console.log(`✅ - Using the following Jito Tip account: ${jitoTipAddress}`);

    // Step 1 - Setup
    const signer = await createKeyPairSignerFromBytes(new Uint8Array(bs58.decode(wallet.privateKey)));
    console.log(`✅ - Sending ${NUMBER_TRANSACTIONS} transactions from ${signer.address}.`);

    // Convert prepared.transaction to VersionedTransaction
    const messageV0 = new TransactionMessage({
      payerKey: prepared.transaction.feePayer,
      recentBlockhash: prepared.transaction.recentBlockhash,
      instructions: prepared.transaction.instructions,
    }).compileToV0Message();

    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([signWallet]);

    const feeMessageV0 = new TransactionMessage({
      payerKey: prepared.transaction.feePayer,
      recentBlockhash: prepared.transaction.recentBlockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 10_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 }),
        SystemProgram.transfer({
          fromPubkey: prepared.transaction.feePayer,
          toPubkey: new PublicKey(jitoTipAddress),
          lamports: MINIMUM_JITO_TIP,
        })
      ],
    }).compileToV0Message();

    const feeTransaction = new VersionedTransaction(feeMessageV0);
    feeTransaction.sign([signWallet]);

    const b = new Bundle([feeTransaction, versionedTransaction], 5);
    // b.addTipTx(
    //   createKeypairFromBase58(wallet.privateKey),
    //   MINIMUM_JITO_TIP,      // Adjust Jito tip amount here
    //   new PublicKey(jitoTipAddress),
    //   latestBlockhash.blockhash
    // );

    const bundleResult: any = await c.sendBundle(b);

    // const jitTipTxFeeMessage = new TransactionMessage({
    //   payerKey: createKeypairFromBase58(wallet.privateKey).publicKey,
    //   recentBlockhash: latestBlockhash.blockhash,
    //   instructions: [
    //     SystemProgram.transfer({
    //       fromPubkey: createKeypairFromBase58(wallet.privateKey).publicKey,
    //       toPubkey: new PublicKey(jitoTipAddress),
    //       lamports: MINIMUM_JITO_TIP,
    //     }),
    //   ],
    // }).compileToV0Message();

    // const jitoFeeTx = new VersionedTransaction(jitTipTxFeeMessage);
    // jitoFeeTx.sign([createKeypairFromBase58(wallet.privateKey)]);

    // const jitoTxsignature = bs58.encode(jitoFeeTx.signatures[0]);

    // const confirmation = await connection.confirmTransaction(
    //   {
    //     signature: jitoTxsignature,
    //     lastValidBlockHeight: Number(latestBlockhash.lastValidBlockHeight),
    //     blockhash: latestBlockhash.blockhash,
    //   },
    //   "confirmed",
    // );

    // console.log("confirmation :> ", confirmation);

    console.log(bundleResult);

    const sig = base58.encode(versionedTransaction.signatures[0])

    console.log("signature :> ", sig)

    console.log(`✅ Transaction sent via Jito: ${bundleResult}`);
    if (bundleResult) {
      return {
        wallet: wallet.number,
        success: true,
        jito: bundleResult.value,
        txid: sig,
        endpoint: blockEngineUrl,
        priorityFee: prepared.priorityFee,
        slippage: prepared.slippage,
      };
    }

    // If all Jito endpoints failed
    console.error('❌ All Jito endpoints failed');
    return {
      wallet: wallet.number,
      success: false,
      error: 'All Jito endpoints failed',
      priorityFee: prepared.priorityFee,
      slippage: prepared.slippage,
    };
  } catch (error) {
    console.error(`❌ Error executing buy for wallet ${wallet.number}:`, error);
    return {
      wallet: wallet.number,
      success: false,
      error: error.message,
      priorityFee: prepared.priorityFee,
      slippage: prepared.slippage,
    };
  }
}

// // Create ATA for all wallets
// async function createATAsForAllWalletsParallel(
//   wallets: any[],
//   tokenMint: PublicKey,
// ) {
//   console.log(`Creating ATAs for ${wallets.length} wallets ...`);
//   const ataAddresses: string[] = [];

//   await Promise.all(wallets.map(async (wallet) => {
//     try {
//       console.log(`\nCreating ATA for wallet ${wallet.number}...`);

//       // Get fresh blockhash for each wallet
//       const { blockhash } = await connection.getLatestBlockhash();

//       // Create ATA instruction
//       const ata = await getAssociatedTokenAddress(
//         tokenMint,
//         new PublicKey(wallet.address),
//       );
//       ataAddresses.push(ata.toBase58());

//       const instruction = createAssociatedTokenAccountInstruction(
//         new PublicKey(wallet.address), // payer
//         ata, // ata
//         new PublicKey(wallet.address), // owner
//         tokenMint, // mint
//       );

//       // Create transaction
//       const messageV0 = new TransactionMessage({
//         payerKey: new PublicKey(wallet.address),
//         recentBlockhash: blockhash,
//         instructions: [
//           ComputeBudgetProgram.setComputeUnitPrice({
//             microLamports: PRIORITY_FEE_MICROLAMPORTS,
//           }),
//           instruction,
//         ],
//       }).compileToV0Message();

//       const transaction = new VersionedTransaction(messageV0);

//       // Sign with wallet's keypair
//       const keypair = createKeypairFromBase58(wallet.privateKey);
//       transaction.sign([keypair]);

//       // Send transaction
//       const txid = await connection.sendTransaction(transaction, {
//         skipPreflight: true,
//         maxRetries: 2,
//       });

//       console.log(`✅ Created ATA for wallet ${wallet.number}: ${txid}`);
//     } catch (error) {
//       console.error(
//         `❌ Error creating ATA for wallet ${wallet.number}:`,
//         error,
//       );
//     }
//   }));

//   console.log(`\n✅ Completed creating ATAs for all wallets!`);
//   return ataAddresses;
// }

// Main function
async function main() {
  try {
    const tokenAddress = "7HGBXdqvTSF4HvuRQy4oCF8kSd5VSmrNqgs6NKkwpump";
    // Get pool address (you'll need to implement this based on your logic)
    const poolPubkey = await getPoolAddress(tokenAddress);
    console.log("poolPubkey :> ", poolPubkey);
    // const tokenAddress = process.argv[2];
    // const tokenMint = new PublicKey(tokenAddress);

    // Load wallets
    console.log(`Loading wallets from ${WALLETS_FILE}...`);
    const wallets = await loadWallets();
    // // Create ATAs for all wallets in parallel
    // console.log('\nCreating ATAs for all wallets...');
    // await createATAsForAllWalletsParallel(wallets, tokenMint);

    // Pause and wait for user input
    console.log('\nATAs have been created. Press ENTER to start sniping...');
    await new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question('', () => {
        rl.close();
        resolve(null);
      });
    });

    // Calculate total SOL being injected by all wallets
    const totalSolInjection = wallets.reduce(
      (total, wallet) => total + wallet.amount,
      0,
    );
    console.log(`Total SOL being injected: ${totalSolInjection} SOL`);

    // Order wallets by priority
    const prioritizedWallets = wallets.map((wallet, index) => {
      const priorityFee =
        PRIORITY_FEE_MICROLAMPORTS + (wallets.length - index) * 10000;
      const jitoTipMultiplier = JITO_TIP_MULT + (wallets.length - index);
      const estimatedPriceImpact =
        (index / wallets.length) * (totalSolInjection / 100) * 5;

      return {
        ...wallet,
        priorityFee,
        jitoTipMultiplier,
        estimatedPriceImpact,
      };
    });

    console.log('Wallet priority and impact configuration:');
    prioritizedWallets.forEach((wallet) => {
      console.log(
        `Wallet ${wallet.number}: ` +
        `Priority Fee ${wallet.priorityFee} microlamports, ` +
        `Jito Tip Multiplier ${wallet.jitoTipMultiplier}x, ` +
        `Estimated Price Impact: ${wallet.estimatedPriceImpact.toFixed(2)}%`,
      );
    });

    console.log('\n=== Starting Parallel Buy Process ===');
    const buyPromises = prioritizedWallets.map((wallet) =>
      prepareAndExecuteWithRetry(
        wallet,
        tokenAddress,
        poolPubkey,
        wallet.amount,
        wallet.priorityFee,
        wallet.estimatedPriceImpact,
        wallet.jitoTipMultiplier,
      ),
    );

    console.log("buypromise>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>", buyPromises);
    // Wait for all promises to complete (they won't actually complete due to retries)
    await Promise.all(buyPromises);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
