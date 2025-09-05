import {
  CurveType,
  Environment,
  MigrationDex,
  Moonit,
  SolanaSerializationService,
} from '@moonit/sdk';
import { Keypair } from '@solana/web3.js';
import { waitForConfirmation, submitWithJito } from './jitoUtils';
import { getBuyTx, getMintAddress, img } from './mintUtils';
import { privateKeyArray, rpcUrl } from './constants';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const prompt = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

export const createMintJito = async (): Promise<void> => {
  console.log('--- Create mint with Jito Time to Get Bread ---');

  const creator = Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
  console.log('Creator: ', creator.publicKey.toBase58());

  const moonit = new Moonit({
    rpcUrl: rpcUrl,
    environment: Environment.MAINNET,
    chainOptions: {
      solana: { confirmOptions: { commitment: 'confirmed' } },
    },
  });

  const prepMint = await moonit.prepareMintTx({
    creator: creator.publicKey.toBase58(),
    name: 'Inside',
    symbol: 'INSIDE',
    curveType: CurveType.FLAT_V1,
    migrationDex: MigrationDex.RAYDIUM,
    icon: img,
    description: 'Insiders',
    links: [{ url: 'https://x.com/insiders_sol', label: 'x handle' }],
    banner: img,
    tokenAmount: '1000000000000',
  });

  const deserializedTransaction =
    SolanaSerializationService.deserializeVersionedTransaction(
      prepMint.transaction,
    );
  if (deserializedTransaction == null) {
    throw new Error('Failed to deserialize transaction');
  }

  deserializedTransaction.sign([creator]);

  const signedTransaction =
    SolanaSerializationService.serializeVersionedTransaction(
      deserializedTransaction,
    );

  const mintAddress = getMintAddress(deserializedTransaction);

  // Display mint address with emojis and separators
  console.log('\n\n');
  console.log('🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀');
  console.log('🔥🔥🔥🔥🔥 MINT ADDRESS 🔥🔥🔥🔥🔥');
  console.log('🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀');
  console.log(`\n${mintAddress.toBase58()}\n`);
  console.log('🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀\n\n');

  // Prompt for amount
  const amountStr = await prompt('Enter amount of SOL to buy (e.g., 1.5): ');
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    throw new Error('Invalid amount. Please enter a positive number.');
  }

  const buyTx = await getBuyTx(moonit, mintAddress.toBase58(), creator, amount);

  const res = await submitWithJito([signedTransaction, buyTx], creator);
  await waitForConfirmation(res);

  rl.close();
};
