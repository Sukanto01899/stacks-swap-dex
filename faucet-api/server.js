import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeed } from '@scure/bip39'
import * as StxTx from '@stacks/transactions'
import * as StacksNetworkPkg from '@stacks/network'
import { deriveStxPrivateKey } from '@stacks/wallet-sdk'


// Faucet server for minting test tokens on Stacks testnet or mainnet.
const app = express()
app.use(cors())
app.use(express.json())

const {
  DEPLOYER_MNEMONIC,
  STACKS_NETWORK = 'testnet',
  STACKS_NODE = '',
  STACKS_NODE_MAINNET = '',
  STACKS_NODE_TESTNET = '',
  CONTRACT_ADDRESS = '',
  CONTRACT_ADDRESS_MAINNET = '',
  CONTRACT_ADDRESS_TESTNET = '',
  FAUCET_PORT = 8787,
  FAUCET_AMOUNT = '5000',
  FAUCET_ALLOW_MAINNET = 'false',
} = process.env

if (!DEPLOYER_MNEMONIC) {
  throw new Error('DEPLOYER_MNEMONIC is required for the faucet to mint tokens.')
}

const { createNetwork, STACKS_MAINNET, STACKS_TESTNET } = StacksNetworkPkg
const {
  AnchorMode,
  PostConditionMode,
  broadcastTransaction,
  getAddressFromPrivateKey,
  makeContractCall,
  standardPrincipalCV,
  uintCV,
} = StxTx

const TOKEN_CONTRACTS = {
  x: { contractName: 'dex-token-x' },
  y: { contractName: 'dex-token-y' },
}

const NETWORK_NAMES = ['mainnet', 'testnet']
const ALLOWED_TOKENS = Object.keys(TOKEN_CONTRACTS)
const ALLOW_MAINNET = String(FAUCET_ALLOW_MAINNET).toLowerCase() === 'true'

const amountInt = Number.parseInt(String(FAUCET_AMOUNT), 10)
if (!Number.isFinite(amountInt) || amountInt <= 0) {
  throw new Error('FAUCET_AMOUNT must be a positive integer.')
}
const amountWithDecimals = BigInt(amountInt) * 1_000_000n

const normalizeNetwork = (value) => {
  const v = String(value || '').trim().toLowerCase()
  return NETWORK_NAMES.includes(v) ? v : null
}

const DEFAULT_NETWORK = normalizeNetwork(STACKS_NETWORK) || 'testnet'
const DEFAULT_NODES = {
  mainnet: 'https://api.hiro.so',
  testnet: 'https://api.testnet.hiro.so',
}

const runtimeByNetwork = {
  mainnet: {
    nodeUrl: STACKS_NODE_MAINNET || STACKS_NODE || DEFAULT_NODES.mainnet,
    contractAddress: CONTRACT_ADDRESS_MAINNET || CONTRACT_ADDRESS || '',
    senderAddress: '',
    network: null,
  },
  testnet: {
    nodeUrl: STACKS_NODE_TESTNET || STACKS_NODE || DEFAULT_NODES.testnet,
    contractAddress: CONTRACT_ADDRESS_TESTNET || CONTRACT_ADDRESS || '',
    senderAddress: '',
    network: null,
  },
}

const isValidAddressForNetwork = (address, networkName) => {
  if (typeof address !== 'string') return false
  if (networkName === 'mainnet') return /^(SP|SM)[A-Z0-9]{38,}$/.test(address)
  return /^S[NT][A-Z0-9]{38,}$/.test(address)
}

let senderKey

const getBaseNetwork = (networkName) =>
  networkName === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET

const getRuntime = (networkName) => runtimeByNetwork[networkName]

const fetchNextNonce = async (runtime) => {
  const url = `${runtime.nodeUrl}/extended/v1/address/${runtime.senderAddress}/nonces`
  const response = await fetch(url)
  if (!response.ok) {
    const fallback = `${runtime.nodeUrl}/v2/accounts/${runtime.senderAddress}?proof=0`
    const accountResponse = await fetch(fallback)
    if (!accountResponse.ok) return null
    const account = await accountResponse.json().catch(() => ({}))
    const next = Number(account?.nonce)
    return Number.isFinite(next) ? next : null
  }
  const data = await response.json().catch(() => ({}))
  const next = Number(
    data?.possible_next_nonce ??
    data?.detected_mempool_nonces?.[0] ??
    data?.last_executed_tx_nonce
  )
  return Number.isFinite(next) ? next : null
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isRetryableNonceError = (error, reason) =>
  /nonce|mempool|chaining/i.test(String(error || '')) ||
  /nonce|mempool|chaining/i.test(String(reason || ''))

const submitMint = async ({
  runtime,
  contractName,
  recipient,
  amount,
  maxAttempts = 3,
}) => {
  let attempt = 0
  let lastError = null

  while (attempt < maxAttempts) {
    attempt += 1
    const nextNonce = await fetchNextNonce(runtime)
    const callOptions = {
      contractAddress: runtime.contractAddress,
      contractName,
      functionName: 'mint',
      functionArgs: [uintCV(amount), standardPrincipalCV(recipient)],
      senderKey,
      network: runtime.network,
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any,
      ...(nextNonce !== null ? { nonce: BigInt(nextNonce) } : {}),
    }

    const tx = await makeContractCall(callOptions)
    const fee =
      tx.auth?.spendingCondition?.fee ?? tx.auth?.originSpendingCondition?.fee ?? 0n

    const response = await broadcastTransaction({
      transaction: tx,
      network: runtime.network,
    })

    if (!('error' in response)) {
      return {
        ok: true,
        tx,
        fee,
        nonce: nextNonce,
      }
    }

    lastError = response
    if (!isRetryableNonceError(response.error, response.reason) || attempt >= maxAttempts) {
      return {
        ok: false,
        error: response.error || 'Broadcast failed',
        reason: response.reason || null,
        nonce: nextNonce,
      }
    }

    await wait(500 * attempt)
  }

  return {
    ok: false,
    error: lastError?.error || 'Broadcast failed',
    reason: lastError?.reason || null,
    nonce: null,
  }
}

async function initWallet() {
  const seed = await mnemonicToSeed(DEPLOYER_MNEMONIC)
  const rootNode = HDKey.fromMasterSeed(seed)
  senderKey = deriveStxPrivateKey({ rootNode, index: 0 })

  for (const networkName of NETWORK_NAMES) {
    const runtime = getRuntime(networkName)
    const baseNetwork = getBaseNetwork(networkName)
    runtime.senderAddress = getAddressFromPrivateKey(senderKey, baseNetwork)
    runtime.network = createNetwork({
      ...baseNetwork,
      client: { baseUrl: runtime.nodeUrl },
    })
  }

  console.log(
    `Faucet ready. Default network=${DEFAULT_NETWORK}, testnet sender=${runtimeByNetwork.testnet.senderAddress}, mainnet sender=${runtimeByNetwork.mainnet.senderAddress}`
  )
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    defaultNetwork: DEFAULT_NETWORK,
    allowMainnet: ALLOW_MAINNET,
    amount: amountWithDecimals.toString(),
    networks: {
      testnet: {
        node: runtimeByNetwork.testnet.nodeUrl,
        sender: runtimeByNetwork.testnet.senderAddress || null,
        hasContractAddress: Boolean(runtimeByNetwork.testnet.contractAddress),
      },
      mainnet: {
        node: runtimeByNetwork.mainnet.nodeUrl,
        sender: runtimeByNetwork.mainnet.senderAddress || null,
        hasContractAddress: Boolean(runtimeByNetwork.mainnet.contractAddress),
      },
    },
  })
})

app.post('/faucet', async (req, res) => {
  try {
    if (!senderKey) {
      return res.status(503).json({ error: 'Faucet not ready yet' })
    }

    const { address, token, network } = req.body || {}
    const networkName = normalizeNetwork(network) || DEFAULT_NETWORK

    if (networkName === 'mainnet' && !ALLOW_MAINNET) {
      return res.status(403).json({
        error: 'Mainnet faucet is disabled. Set FAUCET_ALLOW_MAINNET=true to enable.',
      })
    }

    if (!ALLOWED_TOKENS.includes(token)) {
      return res
        .status(400)
        .json({ error: `Invalid token. Use one of: ${ALLOWED_TOKENS.join(', ')}` })
    }

    if (!isValidAddressForNetwork(address, networkName)) {
      const prefixHint =
        networkName === 'mainnet' ? 'SP... or SM...' : 'ST... or SN...'
      return res.status(400).json({
        error: `Invalid ${networkName} address format. Expected ${prefixHint}.`,
      })
    }

    const runtime = getRuntime(networkName)
    if (!runtime.contractAddress) {
      return res.status(503).json({
        error: `Missing contract address for ${networkName}. Set CONTRACT_ADDRESS_${networkName.toUpperCase()} or CONTRACT_ADDRESS.`,
      })
    }

    const { contractName } = TOKEN_CONTRACTS[token]
    const minted = await submitMint({
      runtime,
      contractName,
      recipient: address,
      amount: amountWithDecimals,
    })

    if (!minted.ok) {
      return res.status(500).json({
        error: minted.error || 'Broadcast failed',
        reason: minted.reason || null,
        network: networkName,
        nonce: minted.nonce !== null ? String(minted.nonce) : null,
      })
    }

    return res.json({
      txid: minted.tx.txid(),
      network: networkName,
      contract: `${runtime.contractAddress}.${contractName}`,
      amount: amountWithDecimals.toString(),
      recipient: address,
      fee: minted.fee.toString(),
      nonce: minted.nonce !== null ? String(minted.nonce) : null,
    })
  } catch (error) {
    console.error('Faucet error', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal faucet error',
    })
  }
})

initWallet().catch((error) => {
  console.error('Failed to initialize faucet wallet', error)
  process.exit(1)
})

app.listen(Number(FAUCET_PORT), () => {
  console.log(`Stacks faucet running on http://localhost:${FAUCET_PORT}`)
})
