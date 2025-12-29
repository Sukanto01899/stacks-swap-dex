# Stacks Exchange — Demo AMM on Stacks

Simple constant-product AMM on Stacks with two demo fungible tokens plus a React (Vite) dashboard. Built for rapid Clarinet devnet experiments: mint demo tokens, seed liquidity, and simulate swaps with a 0.30% fee.

## What’s inside
- Clarity contracts: `ft-trait`, `token-a`, `token-b`, `simple-amm`
- Clarinet project config (`Clarinet.toml`) and devnet accounts (`settings/Devnet.toml`)
- Test scaffold (Vitest + Clarinet SDK) under `tests/`
- Frontend in `frontend/` (Vite + React + TS) with Stacks Connect + Bitcoin (Reown AppKit) stubs

## Contracts summary
- `contracts/ft-trait.clar` — basic FT trait.
- `contracts/token-a.clar` — demo token TKNA (6 decimals). Owner-only mint; transfer allows sender or calling contract.
- `contracts/token-b.clar` — demo token TKNB (6 decimals). Same controls as TKNA.
- `contracts/simple-amm.clar` — constant-product pool for TKNA/TKNB.
  - Add liquidity (enforces ratio after first deposit); remove liquidity pro-rata.
  - Swap A?B or B?A with 0.30% fee (fee-adjusted constant-product math).
  - Tracks reserves and LP shares; helper getters for reserves/total/share-of.

## Prerequisites
- Node.js (>=18 recommended)
- Clarinet (`npm i -g @hirosystems/clarinet`)

## Quickstart (devnet)
```bash
# Check contracts
clarinet check

# Launch a devnet console
clarinet console
```

In the console (uses accounts from `settings/Devnet.toml`):
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
Root tests use Vitest with the Clarinet SDK.
```bash
npm install
npm test
```

## Frontend
React app lives in `frontend/`.
```bash
cd frontend
npm install
npm run dev
```
The UI already simulates swaps/liquidity and includes buttons for Stacks Connect and Bitcoin wallets (Leather/Xverse/WalletConnect via Reown AppKit). Wire real contract calls and wallet flows as your next step.

## Project layout (top-level)
- `contracts/` — Clarity sources
- `tests/` — Vitest + Clarinet SDK tests (add your specs here)
- `settings/` — Devnet/Testnet/Mainnet config
- `frontend/` — Vite React UI scaffold
- `Clarinet.toml` — contract wiring

## Notes / limitations
- Tokens allow contract-initiated transfers so the AMM can pay out.
- Fee is fixed at 0.30% (`fee-bps = 30` over `10_000` bps); adjust in `simple-amm.clar` if needed.
- Slippage protection is caller-provided via `min-out`; trades revert if outputs are too low or pool lacks liquidity.
