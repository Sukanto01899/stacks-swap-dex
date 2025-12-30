import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeed } from '@scure/bip39'
import * as StxTx from '@stacks/transactions'
import * as StacksNetworkPkg from '@stacks/network'
import { deriveStxPrivateKey } from '@stacks/wallet-sdk'

const app = express()
app.use(cors())
app.use(express.json())

const {
  DEPLOYER_MNEMONIC,
  STACKS_NODE = 'https://api.testnet.hiro.so',
  CONTRACT_ADDRESS = 'ST1G4ZDXED8XM2XJ4Q4GJ7F4PG4EJQ1KKXVPSAX13',
  FAUCET_PORT = 8787,
  FAUCET_AMOUNT = '5000',
} = process.env

if (!DEPLOYER_MNEMONIC) {
  throw new Error('DEPLOYER_MNEMONIC is required for the faucet to mint tokens.')
}

const TOKEN_CONTRACTS = {
  x: { contractName: 'token-x' },
  y: { contractName: 'token-y' },
}

const ALLOWED_TOKENS = Object.keys(TOKEN_CONTRACTS)
const amountWithDecimals = BigInt(Math.floor(Number(FAUCET_AMOUNT)) * 1_000_000)
const TX_VERSION_TESTNET = 128

const isValidAddress = (addr) =>
  typeof addr === 'string' && /^S[NT][A-Z0-9]{38,}/.test(addr)

let senderKey
let senderAddress
let network
const { createNetwork, STACKS_TESTNET } = StacksNetworkPkg
const {
  AnchorMode,
  PostConditionMode,
  broadcastTransaction,
  getAddressFromPrivateKey,
  makeContractCall,
  standardPrincipalCV,
  uintCV,
} = StxTx

async function initWallet() {
  const seed = await mnemonicToSeed(DEPLOYER_MNEMONIC)
  const rootNode = HDKey.fromMasterSeed(seed)
  senderKey = deriveStxPrivateKey({ rootNode, index: 0 })
  senderAddress = getAddressFromPrivateKey(senderKey, STACKS_TESTNET)
  network = createNetwork({
    ...STACKS_TESTNET,
    client: { baseUrl: STACKS_NODE },
  })
  console.log(`Faucet ready. Sender: ${senderAddress} | Node: ${STACKS_NODE}`)
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, sender: senderAddress, network: STACKS_NODE })
})

app.post('/faucet', async (req, res) => {
  try {
    if (!senderKey) {
      return res.status(503).json({ error: 'Faucet not ready yet' })
    }

  const { address, token } = req.body || {}
  if (!isValidAddress(address)) {
    return res
      .status(400)
      .json({ error: 'Invalid Stacks address (must be testnet: starts with ST or SN)' })
  }

    if (!ALLOWED_TOKENS.includes(token)) {
      return res
        .status(400)
        .json({ error: `Invalid token. Use one of: ${ALLOWED_TOKENS.join(', ')}` })
    }

    const { contractName } = TOKEN_CONTRACTS[token]

    const callOptions = {
      contractAddress: CONTRACT_ADDRESS,
      contractName,
      functionName: 'mint',
      functionArgs: [uintCV(amountWithDecimals), standardPrincipalCV(address)],
      senderKey,
      network,
      postConditionMode: PostConditionMode.Deny,
      anchorMode: AnchorMode.Any,
    }

    const tx = await makeContractCall(callOptions)
    const fee =
      tx.auth?.spendingCondition?.fee ?? tx.auth?.originSpendingCondition?.fee ?? 0n
    const response = await broadcastTransaction({ transaction: tx, network })

    if ('error' in response) {
      return res.status(500).json({ error: response.error, reason: response.reason })
    }

    res.json({
      txid: tx.txid(),
      contract: `${CONTRACT_ADDRESS}.${contractName}`,
      amount: amountWithDecimals.toString(),
      recipient: address,
      fee: fee.toString(),
    })
  } catch (error) {
    console.error('Faucet error', error)
    res.status(500).json({ error: 'Internal faucet error' })
  }
})

initWallet().catch((error) => {
  console.error('Failed to initialize faucet wallet', error)
  process.exit(1)
})

app.listen(Number(FAUCET_PORT), () => {
  console.log(`Stacks faucet running on http://localhost:${FAUCET_PORT}`)
})
