import 'dotenv/config';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@scure/bip39';
import {
  AnchorMode,
  PostConditionMode,
  broadcastTransaction,
  contractPrincipalCV,
  cvToValue,
  fetchCallReadOnlyFunction,
  getAddressFromPrivateKey,
  makeContractCall,
  makeSTXTokenTransfer,
  randomPrivateKey,
  standardPrincipalCV,
  uintCV,
} from '@stacks/transactions';
import {
  STACKS_DEVNET,
  STACKS_MAINNET,
  STACKS_TESTNET,
  createNetwork,
} from '@stacks/network';
import { deriveStxPrivateKey } from '@stacks/wallet-sdk';

const HELP_TEXT = `
Clardex load-test runner

Required env:
  LOAD_TEST_FUNDER_MNEMONIC   Mnemonic for the wallet funding STX fees

Recommended env:
  LOAD_TEST_NETWORK           testnet | devnet (default: testnet)
  LOAD_TEST_NODE_URL          Override node URL for the selected network
  LOAD_TEST_FAUCET_URL        Faucet base URL (default: http://localhost:8787)
  LOAD_TEST_CONTRACT_ADDRESS  Contract deployer address for token/pool contracts
  LOAD_TEST_POOL_CONTRACT     Pool contract name (default: dex-pool-v5)
  LOAD_TEST_TOKEN_X_CONTRACT  Token X contract name (default: dex-token-x)
  LOAD_TEST_TOKEN_Y_CONTRACT  Token Y contract name (default: dex-token-y)
  LOAD_TEST_CYCLES            Number of generated wallets/cycles (default: 3)
  LOAD_TEST_DELAY_MS          Delay between submitted txs (default: 4000)
  LOAD_TEST_STX_PER_WALLET    STX per generated wallet, in STX (default: 0.5)
  LOAD_TEST_SWAP_X_AMOUNT     Swap X amount, token units (default: 5)
  LOAD_TEST_SWAP_Y_AMOUNT     Swap Y amount, token units (default: 3)
  LOAD_TEST_LIQUIDITY_X       Add-liquidity X amount, token units (default: 8)
  LOAD_TEST_LIQUIDITY_Y       Add-liquidity Y amount, token units (default: 8)
  LOAD_TEST_REMOVE_RATIO      LP burn ratio, 0-1 (default: 0.4)
`;

if (process.argv.includes('--help')) {
  console.log(HELP_TEXT.trim());
  process.exit(0);
}

const TOKEN_DECIMALS = 1_000_000n;
const DEFAULT_DEADLINE = 999_999_999n;
const NETWORK_NAMES = ['testnet', 'devnet', 'mainnet'];
const DEFAULT_NODES = {
  mainnet: 'https://api.hiro.so',
  testnet: 'https://api.testnet.hiro.so',
  devnet: 'http://localhost:3999',
};

const normalizeNetwork = value => {
  const network = String(value || 'testnet').trim().toLowerCase();
  return NETWORK_NAMES.includes(network) ? network : null;
};

const networkName = normalizeNetwork(process.env.LOAD_TEST_NETWORK) || 'testnet';
if (networkName === 'mainnet') {
  throw new Error('This load-test script is restricted to testnet/devnet.');
}

const {
  LOAD_TEST_FUNDER_MNEMONIC,
  LOAD_TEST_NODE_URL = '',
  LOAD_TEST_FAUCET_URL = 'http://localhost:8787',
  LOAD_TEST_CONTRACT_ADDRESS = '',
  LOAD_TEST_POOL_CONTRACT = 'dex-pool-v5',
  LOAD_TEST_TOKEN_X_CONTRACT = 'dex-token-x',
  LOAD_TEST_TOKEN_Y_CONTRACT = 'dex-token-y',
  LOAD_TEST_CYCLES = '3',
  LOAD_TEST_DELAY_MS = '4000',
  LOAD_TEST_STX_PER_WALLET = '0.5',
  LOAD_TEST_SWAP_X_AMOUNT = '5',
  LOAD_TEST_SWAP_Y_AMOUNT = '3',
  LOAD_TEST_LIQUIDITY_X = '8',
  LOAD_TEST_LIQUIDITY_Y = '8',
  LOAD_TEST_REMOVE_RATIO = '0.4',
} = process.env;

if (!LOAD_TEST_FUNDER_MNEMONIC) {
  throw new Error('LOAD_TEST_FUNDER_MNEMONIC is required.');
}

const contractAddress =
  LOAD_TEST_CONTRACT_ADDRESS ||
  process.env[`CONTRACT_ADDRESS_${networkName.toUpperCase()}`] ||
  process.env.CONTRACT_ADDRESS ||
  '';

if (!contractAddress) {
  throw new Error(
    `Missing contract address. Set LOAD_TEST_CONTRACT_ADDRESS or CONTRACT_ADDRESS_${networkName.toUpperCase()}.`,
  );
}

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const cycles = Math.max(1, Math.floor(parseNumber(LOAD_TEST_CYCLES, 3)));
const delayMs = Math.max(0, Math.floor(parseNumber(LOAD_TEST_DELAY_MS, 4000)));
const removeRatio = Math.min(1, Math.max(0, parseNumber(LOAD_TEST_REMOVE_RATIO, 0.4)));

const toMicroStx = value => {
  const parsed = parseNumber(value, 0);
  if (parsed <= 0) throw new Error(`Invalid STX amount: ${value}`);
  return BigInt(Math.round(parsed * 1_000_000));
};

const toTokenUnits = value => {
  const parsed = parseNumber(value, 0);
  if (parsed <= 0) throw new Error(`Invalid token amount: ${value}`);
  return BigInt(Math.round(parsed * Number(TOKEN_DECIMALS)));
};

const config = {
  networkName,
  nodeUrl: LOAD_TEST_NODE_URL || DEFAULT_NODES[networkName],
  faucetUrl: LOAD_TEST_FAUCET_URL.replace(/\/$/, ''),
  contractAddress,
  poolContractName: LOAD_TEST_POOL_CONTRACT,
  tokenXContractName: LOAD_TEST_TOKEN_X_CONTRACT,
  tokenYContractName: LOAD_TEST_TOKEN_Y_CONTRACT,
  cycles,
  delayMs,
  stxPerWallet: toMicroStx(LOAD_TEST_STX_PER_WALLET),
  swapXAmount: toTokenUnits(LOAD_TEST_SWAP_X_AMOUNT),
  swapYAmount: toTokenUnits(LOAD_TEST_SWAP_Y_AMOUNT),
  liquidityX: toTokenUnits(LOAD_TEST_LIQUIDITY_X),
  liquidityY: toTokenUnits(LOAD_TEST_LIQUIDITY_Y),
  removeRatio,
};

const getBaseNetwork = name => {
  if (name === 'mainnet') return STACKS_MAINNET;
  if (name === 'devnet') return STACKS_DEVNET;
  return STACKS_TESTNET;
};

const network = createNetwork({
  ...getBaseNetwork(config.networkName),
  client: { baseUrl: config.nodeUrl },
});

const sleep = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const explainBroadcastError = response =>
  response.reason || response.error || 'Broadcast failed';

const fetchNextNonce = async address => {
  const url = `${config.nodeUrl}/extended/v1/address/${address}/nonces`;
  const response = await fetch(url).catch(() => null);
  if (response?.ok) {
    const result = await response.json().catch(() => ({}));
    const next = Number(
      result?.possible_next_nonce ??
        result?.detected_mempool_nonces?.[0] ??
        result?.last_executed_tx_nonce,
    );
    if (Number.isFinite(next)) return BigInt(next);
  }

  const fallbackUrl = `${config.nodeUrl}/v2/accounts/${address}?proof=0`;
  const fallback = await fetch(fallbackUrl);
  if (!fallback.ok) {
    throw new Error(`Could not fetch nonce for ${address}`);
  }
  const account = await fallback.json().catch(() => ({}));
  return BigInt(account?.nonce || 0);
};

const isRetryableError = message => /nonce|mempool|chaining/i.test(String(message || ''));

const submitWithRetries = async ({ makeTx, senderAddress, label, maxAttempts = 3 }) => {
  let lastMessage = 'Unknown broadcast error';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const nonce = await fetchNextNonce(senderAddress);
    const transaction = await makeTx(nonce);
    const response = await broadcastTransaction({
      transaction,
      network,
    });

    if (!('error' in response)) {
      return {
        txid: transaction.txid(),
        nonce: nonce.toString(),
      };
    }

    lastMessage = explainBroadcastError(response);
    console.warn(`${label} failed on attempt ${attempt}: ${lastMessage}`);
    if (!isRetryableError(lastMessage) || attempt === maxAttempts) break;
    await sleep(500 * attempt);
  }

  throw new Error(`${label} failed: ${lastMessage}`);
};

const makeWalletFromMnemonic = async mnemonic => {
  const seed = await mnemonicToSeed(mnemonic);
  const rootNode = HDKey.fromMasterSeed(seed);
  const privateKey = deriveStxPrivateKey({ rootNode, index: 0 });
  const address = getAddressFromPrivateKey(privateKey, getBaseNetwork(config.networkName));
  return { privateKey, address };
};

const createEphemeralWallet = () => {
  const privateKey = randomPrivateKey();
  const address = getAddressFromPrivateKey(privateKey, getBaseNetwork(config.networkName));
  return { privateKey, address };
};

const readOnlyOk = raw => {
  const parsed = cvToValue(raw);
  if (parsed && typeof parsed === 'object' && 'success' in parsed) {
    if (!parsed.success) {
      throw new Error(`Read-only call failed: ${String(parsed.value || '')}`);
    }
    return parsed.value;
  }
  return parsed;
};

const getPrincipalArgs = () => [
  contractPrincipalCV(config.contractAddress, config.tokenXContractName),
  contractPrincipalCV(config.contractAddress, config.tokenYContractName),
];

const callPoolReadOnly = async functionName => {
  const result = await fetchCallReadOnlyFunction({
    contractAddress: config.contractAddress,
    contractName: config.poolContractName,
    functionName,
    functionArgs: [],
    senderAddress: contractAddress,
    network,
  });
  return readOnlyOk(result);
};

const getPoolReserves = async () => {
  const raw = await callPoolReadOnly('get-reserves');
  const reserveX = Number(raw?.value?.['reserve-x'] ?? raw?.['reserve-x'] ?? 0);
  const reserveY = Number(raw?.value?.['reserve-y'] ?? raw?.['reserve-y'] ?? 0);
  return { reserveX, reserveY };
};

const getLpBalance = async address => {
  const result = await fetchCallReadOnlyFunction({
    contractAddress: config.contractAddress,
    contractName: config.poolContractName,
    functionName: 'get-lp-balance',
    functionArgs: [standardPrincipalCV(address)],
    senderAddress: address,
    network,
  });
  const raw = readOnlyOk(result);
  return BigInt(raw || 0);
};

const requestFaucetToken = async (address, token) => {
  const response = await fetch(`${config.faucetUrl}/faucet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address,
      token,
      network: config.networkName,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Faucet ${token} request failed`);
  }
  return payload;
};

const fundWallet = async (funder, recipientAddress) =>
  submitWithRetries({
    senderAddress: funder.address,
    label: `Fund ${recipientAddress}`,
    makeTx: nonce =>
      makeSTXTokenTransfer({
        network,
        senderKey: funder.privateKey,
        recipient: recipientAddress,
        amount: config.stxPerWallet,
        memo: `loadtest-${Date.now()}`,
        anchorMode: AnchorMode.Any,
        nonce,
      }),
  });

const submitPoolCall = async ({
  wallet,
  functionName,
  functionArgs,
  label,
}) =>
  submitWithRetries({
    senderAddress: wallet.address,
    label,
    makeTx: nonce =>
      makeContractCall({
        contractAddress: config.contractAddress,
        contractName: config.poolContractName,
        functionName,
        functionArgs,
        senderKey: wallet.privateKey,
        network,
        postConditionMode: PostConditionMode.Allow,
        anchorMode: AnchorMode.Any,
        validateWithAbi: true,
        nonce,
      }),
  });

const runWalletCycle = async (wallet, index) => {
  const principalArgs = getPrincipalArgs();
  console.log(`\n[cycle ${index}] wallet=${wallet.address}`);

  const funded = await fundWallet(funderWallet, wallet.address);
  console.log(`[cycle ${index}] funded stx tx=${funded.txid}`);
  await sleep(config.delayMs);

  const mintX = await requestFaucetToken(wallet.address, 'x');
  console.log(`[cycle ${index}] faucet x tx=${mintX.txid}`);
  await sleep(config.delayMs);

  const mintY = await requestFaucetToken(wallet.address, 'y');
  console.log(`[cycle ${index}] faucet y tx=${mintY.txid}`);
  await sleep(config.delayMs);

  const swapX = await submitPoolCall({
    wallet,
    functionName: 'swap-x-for-y',
    label: `swap-x-for-y ${wallet.address}`,
    functionArgs: [
      ...principalArgs,
      uintCV(config.swapXAmount),
      uintCV(0),
      standardPrincipalCV(wallet.address),
      uintCV(DEFAULT_DEADLINE),
    ],
  });
  console.log(`[cycle ${index}] swap x->y tx=${swapX.txid}`);
  await sleep(config.delayMs);

  const addLiquidity = await submitPoolCall({
    wallet,
    functionName: 'add-liquidity',
    label: `add-liquidity ${wallet.address}`,
    functionArgs: [
      ...principalArgs,
      uintCV(config.liquidityX),
      uintCV(config.liquidityY),
      uintCV(0),
    ],
  });
  console.log(`[cycle ${index}] add liquidity tx=${addLiquidity.txid}`);
  await sleep(config.delayMs);

  const lpBalance = await getLpBalance(wallet.address);
  if (lpBalance <= 0n) {
    throw new Error(`No LP balance after add-liquidity for ${wallet.address}`);
  }

  const burnAmount = BigInt(
    Math.max(1, Math.floor(Number(lpBalance) * config.removeRatio)),
  );
  const removeLiquidity = await submitPoolCall({
    wallet,
    functionName: 'remove-liquidity',
    label: `remove-liquidity ${wallet.address}`,
    functionArgs: [
      ...principalArgs,
      uintCV(burnAmount),
      uintCV(0),
      uintCV(0),
    ],
  });
  console.log(`[cycle ${index}] remove liquidity tx=${removeLiquidity.txid}`);
  await sleep(config.delayMs);

  const swapY = await submitPoolCall({
    wallet,
    functionName: 'swap-y-for-x',
    label: `swap-y-for-x ${wallet.address}`,
    functionArgs: [
      ...principalArgs,
      uintCV(config.swapYAmount),
      uintCV(0),
      standardPrincipalCV(wallet.address),
      uintCV(DEFAULT_DEADLINE),
    ],
  });
  console.log(`[cycle ${index}] swap y->x tx=${swapY.txid}`);

  return {
    wallet: wallet.address,
    fundedTxid: funded.txid,
    faucetXTxid: mintX.txid,
    faucetYTxid: mintY.txid,
    swapXTxid: swapX.txid,
    addLiquidityTxid: addLiquidity.txid,
    removeLiquidityTxid: removeLiquidity.txid,
    swapYTxid: swapY.txid,
  };
};

console.log(
  JSON.stringify(
    {
      network: config.networkName,
      nodeUrl: config.nodeUrl,
      contractAddress: config.contractAddress,
      poolContract: config.poolContractName,
      cycles: config.cycles,
    },
    null,
    2,
  ),
);

const reserves = await getPoolReserves();
if (reserves.reserveX <= 0 || reserves.reserveY <= 0) {
  throw new Error(
    `Pool ${config.contractAddress}.${config.poolContractName} has zero reserves. Initialize it before load testing.`,
  );
}

const funderWallet = await makeWalletFromMnemonic(LOAD_TEST_FUNDER_MNEMONIC);
console.log(`Funder address: ${funderWallet.address}`);

const results = [];
for (let index = 1; index <= config.cycles; index += 1) {
  const wallet = createEphemeralWallet();
  try {
    const result = await runWalletCycle(wallet, index);
    results.push({ ok: true, ...result });
  } catch (error) {
    console.error(`[cycle ${index}] failed`, error);
    results.push({
      ok: false,
      wallet: wallet.address,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

console.log('\nLoad test summary');
console.log(JSON.stringify(results, null, 2));
