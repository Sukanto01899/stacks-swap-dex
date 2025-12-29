# Stacks Exchange - Demo AMM on Stacks

Constant-product AMM with two demo fungible tokens and a Vite/React dashboard. Built for quick Clarinet devnet runs: mint tokens, seed liquidity, and simulate swaps (fee 0.30%).

## What's inside
- Clarity contracts: `ft-trait`, `token-a`, `token-b`, `simple-amm`
- Clarinet config (`Clarinet.toml`) + devnet accounts (`settings/Devnet.toml`)
- Vitest scaffold under `tests/`
- Frontend in `frontend/` (React + TS) with Stacks Connect and Bitcoin (Reown AppKit) stubs

## Contracts summary
- `contracts/ft-trait.clar` — basic FT trait
- `contracts/token-a.clar` — TKNA (6 decimals), owner-only mint; contract/sender transfers allowed
- `contracts/token-b.clar` — TKNB (6 decimals), same controls as TKNA
- `contracts/simple-amm.clar` — constant-product AMM
  - Add/remove liquidity (first deposit sets ratio, then ratio enforced)
  - Swap A↔B with 0.30% fee (fee-adjusted constant-product math)
  - Tracks reserves, LP shares, and share-of helper

## Prerequisites
- Node.js (>=18)
- Clarinet (`npm i -g @hirosystems/clarinet`)

## Quickstart (devnet)
```bash
# Check contracts
clarinet check

# Launch a devnet console
clarinet console
```

In the console (accounts from `settings/Devnet.toml`):
```lisp
;; Mint demo tokens to wallet_1 (only deployer can mint)
(contract-call? .token-a mint u1000000 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5)
(contract-call? .token-b mint u1000000 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5)

;; Add liquidity from wallet_1 (first deposit sets ratio)
::wallet_1 (contract-call? .simple-amm add-liquidity u500000 u500000)

;; Swap TKNA for TKNB with slippage guard
::wallet_1 (contract-call? .simple-amm swap-a-for-b u100000 u90000)

;; Remove liquidity
::wallet_1 (contract-call? .simple-amm remove-liquidity u10000)

;; Inspect state
(contract-call? .simple-amm get-reserves)
(contract-call? .simple-amm get-share-of 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5)
```

## Tests
Vitest + Clarinet SDK at root:
```bash
npm install
npm test
```

## Frontend
React app in `frontend/`:
```bash
cd frontend
npm install
npm run dev
```

### What the UI does today
- Uniswap-style swap box with live constant-product quote and price impact preview
- Liquidity tab for add/remove with LP share tracking
- Faucet buttons to airdrop 5k X and 5k Y demo tokens into local wallet state to test swaps/LP without on-chain calls
- Wallet buttons: Stacks Connect modal (new `connect()` API) and Bitcoin connect (Leather/Xverse/WalletConnect via Reown AppKit modal stub)

### Quick UX flow
1) Run `npm run dev`, open the app, click **Faucet 5k X + 5k Y** to seed balances.
2) Swap X↔Y on the Swap tab; pool reserves update in the side panel.
3) Add/remove liquidity on the Liquidity tab; LP shares and pool share update.
4) Optional: click **Connect Stacks** to open the modal (addresses returned; contract calls not yet wired).

### Wiring to real contracts
- Replace simulated handlers in `frontend/src/App.tsx` (`handleSwap`, `handleAddLiquidity`, `handleRemoveLiquidity`) with contract calls to `simple-amm` (or your upgraded pool) using `@stacks/transactions`.
- Pass the connected address; enforce slippage via contract `min-out` args.
- Initialize UI from on-chain reserves/LP supply instead of local defaults.

## Project layout
- `contracts/` — Clarity sources
- `tests/` — Vitest + Clarinet SDK tests
- `settings/` — Devnet/Testnet/Mainnet config
- `frontend/` — Vite React UI
- `Clarinet.toml` — contract wiring

## Notes / limitations
- Tokens allow contract-initiated transfers so the AMM can pay out.
- Fee fixed at 0.30% (`fee-bps = 30` over `10_000`); adjust in `simple-amm.clar` if needed.
- Slippage protection is caller-provided via `min-out`; trades revert if outputs are too low or pool lacks liquidity.
