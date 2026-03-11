# Stacks Exchange

Stacks Exchange is an AMM-based decentralized exchange built on Stacks. It combines Clarity smart contracts, a React trading interface, and a faucet-backed testing workflow to make it easier to experiment with swaps, liquidity provisioning, and on-chain trading UX in the Stacks ecosystem.

This repository is positioned as an open builder-focused exchange prototype: useful today as a working demo and development environment, and designed to evolve into a more complete production-ready DEX.

## Grant Summary

### What this project does
- Enables token swaps through a constant-product AMM pool
- Supports liquidity provision and LP share accounting
- Exposes pool analytics, portfolio tracking, price alerts, and activity history in the frontend
- Includes a faucet API for test token distribution during development and testing
- Provides a foundation for future multi-pair routing, deeper analytics, and production-grade trading flows

### Who it serves
- Stacks developers building DeFi products or integrations
- Ecosystem teams that need a reference AMM implementation on Stacks
- Testnet users and early adopters exploring swaps and liquidity on Stacks
- Grant programs, hackathons, and technical reviewers looking for a demonstrable on-chain product with a clear roadmap

### Why it matters
Stacks needs more usable, builder-friendly DeFi infrastructure that is easy to inspect, test, extend, and integrate. This project lowers the barrier for teams that want to ship exchange functionality on Stacks by providing both smart contract and frontend layers in one codebase.

## Problem

Building exchange infrastructure on Stacks still requires significant custom work across several layers:
- contract design for swaps and liquidity
- frontend UX for pricing, slippage, approvals, and wallet interactions
- dev tooling for faucet flows, testing, and repeated network validation
- analytics and portfolio visibility for users and reviewers

Many projects can build one of these pieces, but not all of them together in a way that is easy to understand, demo, and iterate on.

## Solution

Stacks Exchange provides an end-to-end exchange prototype with:
- Clarity AMM pool contracts
- SIP-010 demo tokens
- a wallet-connected frontend
- a faucet API for test token minting
- testing and load-test tooling

The result is a practical foundation for a Stacks-native exchange experience that can be extended into a larger DeFi product.

## Current Product Scope

### Smart Contracts
The repository includes multiple pool contract iterations, with the current frontend configured around `dex-pool-v5`.

Core contract capabilities:
- swap X for Y
- swap Y for X
- initialize a pool
- add liquidity
- remove liquidity
- LP balance and pool-share tracking
- reserve and fee inspection
- batch operation helpers in the latest pool version

Relevant contracts:
- `contracts/pool-v5-c6.clar`
- `contracts/test-tokens/token-x-c6.clar`
- `contracts/test-tokens/token-y-c6.clar`
- `contracts/traits/sip-010-trait-c6.clar`

### Frontend
The frontend is built with React + TypeScript and already includes more than a basic swap screen.

Current UX features:
- swap interface with live quotes
- slippage and deadline controls
- price impact warnings and swap preview
- liquidity add/remove flows
- portfolio panel
- analytics panel with local charting
- recent activity history
- price alert management
- onboarding guide
- balance-fill and preset actions for swaps and liquidity
- Stacks wallet connect
- Bitcoin wallet modal stub through Reown AppKit

### Faucet API
The faucet service can mint demo tokens to a connected address for supported networks. This improves developer velocity and makes it easier to validate trading flows on test networks.

### Load Testing
This repo also includes a load-test runner that can cycle through generated wallets on `testnet` today and can be switched later to `devnet` via configuration.

## Architecture

### 1. Clarity Contracts
- `dex-token-x` and `dex-token-y` implement SIP-010-style fungible tokens for testing
- `dex-pool-v5` manages reserves, swaps, LP balances, fee accounting, and liquidity state

### 2. Frontend App
- Reads pool state and token balances
- Submits contract calls through Stacks wallet flows
- Visualizes prices, activity, and user portfolio data

### 3. Faucet Service
- Uses a configured deployer mnemonic
- Mints demo tokens for supported networks
- Supports local development and testnet workflows

### 4. Test / Ops Tooling
- Clarinet configuration for contract validation
- Vitest scaffolding for automated testing
- network-configurable load-test script for repetitive contract interaction testing

## Project Status

### Working now
- AMM pool contract suite exists and is wired in Clarinet
- frontend can connect wallets and operate around the active pool contract
- faucet service is implemented
- load-test script exists for repeatable testnet/devnet wallet cycles

### In progress / next step areas
- stronger protocol test coverage around pool behavior
- persistent analytics beyond local frontend storage
- multi-pair registry/factory support
- routing and deeper trade execution logic
- production hardening for contract and frontend flows

## Roadmap

### Near term
- expand test coverage for swaps, fees, LP mint/burn, and edge cases
- improve reliability of on-chain transaction handling
- strengthen analytics and transaction history persistence
- polish onboarding and mobile experience

### Medium term
- multi-pool support and dynamic pair listing
- route discovery across multiple pools
- better LP metrics, APR estimation, and fee reporting
- more complete indexer-backed analytics

### Long term
- production deployment hardening
- broader token support
- ecosystem integrations
- a more complete Stacks-native trading platform

## Why This Is Grant-Worthy

This project is valuable as grant infrastructure because it is not just a contract repo or just a frontend demo. It is a full-stack Stacks DeFi prototype that can:
- onboard new builders faster
- serve as a reusable reference for AMM design on Stacks
- create real testnet activity and developer experimentation
- accelerate future exchange, liquidity, and analytics products in the ecosystem

A grant would help move the project from functional prototype to ecosystem-grade exchange infrastructure.

## Repository Layout

- `contracts/` - Clarity smart contracts
- `contracts/test-tokens/` - test SIP-010 token contracts
- `contracts/traits/` - trait contracts
- `frontend/` - Vite + React frontend
- `faucet-api/` - token faucet server
- `scripts/` - operational scripts including load testing
- `tests/` - test suite
- `settings/` - network configuration
- `Clarinet.toml` - project contract configuration

## Quickstart

### Prerequisites
- Node.js 18+
- Clarinet

### Contract validation
```bash
clarinet check
```

### Root tests
```bash
npm install
npm test
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Faucet API
```bash
npm run faucet
```

### Load test runner
```bash
npm run loadtest -- --help
```

## Configuration

Environment examples are documented in `.env.example`.

Important variables include:
- `DEPLOYER_MNEMONIC`
- `STACKS_NETWORK`
- `CONTRACT_ADDRESS_TESTNET`
- `VITE_POOL_CONTRACT`
- `VITE_TOKEN_X`
- `VITE_TOKEN_Y`
- `LOAD_TEST_NETWORK`
- `LOAD_TEST_FUNDER_MNEMONIC`

## Notes

- The latest pool contract in active frontend use is `dex-pool-v5`
- Fee logic is currently fixed in the pool contract implementation
- The repo includes historical pool versions, which are useful for iteration history but should not be confused with the active contract target
- Current analytics are partly frontend-derived and should be expanded with persistent indexing for production use

## Contact / Review Context

If you are reviewing this project for a grant, the key takeaway is:

Stacks Exchange already demonstrates a credible full-stack DeFi base on Stacks, and grant support would directly accelerate its transition from developer-grade AMM prototype to ecosystem-ready exchange infrastructure.
