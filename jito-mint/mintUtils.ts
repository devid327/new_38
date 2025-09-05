import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  FixedSide,
  getCurveAdapter,
  Moonit,
  SolanaSerializationService,
} from '@moonit/sdk';
import { connection } from './constants';
import { ContractCurveType } from '@heliofi/launchpad-common';
import { CurveAccount } from '@moonit/sdk/dist/types/domain/model/curve/CurveAccount';
import * as fs from 'fs';
import * as path from 'path';

// Load and convert the PNG to a data URL
const pngContent = fs.readFileSync(path.join(__dirname, 'image.png'));
export const img = `data:image/png;base64,${pngContent.toString('base64')}`;

/**
 * Mint address is always the second signer of the transaction
 * */
export const getMintAddress = (tx: VersionedTransaction): PublicKey => {
  const signers: PublicKey[] = [];

  for (let i = 0; i < tx.message.header.numRequiredSignatures; i++) {
    signers.push(tx.message.staticAccountKeys[i]);
  }
  if (signers[1] == null) {
    throw new Error('Transaction is malformed');
  }
  return signers[1];
};

export const getBuyTx = async (
  moonit: Moonit,
  mintAddress: string,
  creator: Keypair,
  amount: number,
): Promise<string> => {
  const curve = getCurveAdapter(
    { curveType: ContractCurveType.CONSTANT_PRODUCT_V1 } as CurveAccount, // we only need curve type for constant product curve
    moonit.provider,
    mintAddress,
  );
  
  const collateralAmount = BigInt(amount * 1_000_000_000);
  
  const tokenAmount = curve.getTokenAmountByCollateralSync({
    collateralAmount: collateralAmount,
    tradeDirection: 'BUY',
    curvePosition: 0n, // assuming we did not buy yet
  });
  
  const token = moonit.Token({ mintAddress });

  const { ixs } = await token.prepareIxs({
    slippageBps: 2_500, // 25%
    creatorPK: creator.publicKey.toBase58(),
    0,
    collateralAmount,
    tradeDirection: 'BUY',
    fixedSide: FixedSide.IN, // This means you will get exactly the token amount and slippage is applied to collateral amount
  });

  const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 200_000,
  });

  const blockhash = await connection.getLatestBlockhash('confirmed');
  const messageV0 = new TransactionMessage({
    payerKey: creator.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions: [priorityIx, ...ixs],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  transaction.sign([creator]);

  return SolanaSerializationService.serializeVersionedTransaction(transaction);
};
