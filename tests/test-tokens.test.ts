import { describe, it, expect } from 'vitest'
import { Cl, cvToValue } from '@stacks/transactions'

describe('token-x-c4', () => {
  it('allows the contract owner to mint and updates balance', () => {
    const accounts = simnet.getAccounts()
    const deployer = accounts.get('deployer')
    const wallet1 = accounts.get('wallet_1')

    if (!deployer || !wallet1) throw new Error('Missing test accounts')

    const beforeBalance = simnet.callReadOnlyFn(
      'token-x-c4',
      'get-balance',
      [Cl.principal(wallet1)],
      deployer
    )
    const beforeValue = cvToValue(beforeBalance.result) as {
      success: boolean
      value: string
    }
    if (!beforeValue.success) throw new Error('Expected ok balance response')

    const mint = simnet.callPublicFn(
      'token-x-c4',
      'mint',
      [Cl.uint(1_000), Cl.principal(wallet1)],
      deployer
    )
    expect(mint.result).toBeOk(Cl.bool(true))

    const afterBalance = simnet.callReadOnlyFn(
      'token-x-c4',
      'get-balance',
      [Cl.principal(wallet1)],
      deployer
    )
    const afterValue = cvToValue(afterBalance.result) as {
      success: boolean
      value: string
    }
    if (!afterValue.success) throw new Error('Expected ok balance response')
    expect(BigInt(afterValue.value)).toBe(BigInt(beforeValue.value) + 1000n)
  })

  it('rejects mint calls from non-owner', () => {
    const accounts = simnet.getAccounts()
    const deployer = accounts.get('deployer')
    const wallet1 = accounts.get('wallet_1')

    if (!deployer || !wallet1) throw new Error('Missing test accounts')

    const mint = simnet.callPublicFn(
      'token-x-c4',
      'mint',
      [Cl.uint(500), Cl.principal(wallet1)],
      wallet1
    )

    expect(mint.result).toBeErr(Cl.uint(401))
  })

  it('allows holders to transfer their own tokens', () => {
    const accounts = simnet.getAccounts()
    const deployer = accounts.get('deployer')
    const wallet1 = accounts.get('wallet_1')
    const wallet2 = accounts.get('wallet_2')

    if (!deployer || !wallet1 || !wallet2) throw new Error('Missing test accounts')

    simnet.callPublicFn(
      'token-x-c4',
      'mint',
      [Cl.uint(2_000), Cl.principal(wallet1)],
      deployer
    )

    const transfer = simnet.callPublicFn(
      'token-x-c4',
      'transfer',
      [Cl.uint(750), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()],
      wallet1
    )

    expect(transfer.result).toBeOk(Cl.bool(true))

    const wallet2Balance = simnet.callReadOnlyFn(
      'token-x-c4',
      'get-balance',
      [Cl.principal(wallet2)],
      deployer
    )
    const wallet2Value = cvToValue(wallet2Balance.result) as {
      success: boolean
      value: string
    }
    if (!wallet2Value.success) throw new Error('Expected ok balance response')
    expect(BigInt(wallet2Value.value)).toBeGreaterThanOrEqual(750n)
  })
})

describe('token-y-c4', () => {
  it('tracks total supply after mint', () => {
    const accounts = simnet.getAccounts()
    const deployer = accounts.get('deployer')
    const wallet1 = accounts.get('wallet_1')

    if (!deployer || !wallet1) throw new Error('Missing test accounts')

    const before = simnet.callReadOnlyFn(
      'token-y-c4',
      'get-total-supply',
      [],
      deployer
    )
    const beforeValue = cvToValue(before.result) as {
      success: boolean
      value: string
    }
    if (!beforeValue.success) throw new Error('Expected ok supply response')

    const mint = simnet.callPublicFn(
      'token-y-c4',
      'mint',
      [Cl.uint(3_333), Cl.principal(wallet1)],
      deployer
    )
    expect(mint.result).toBeOk(Cl.bool(true))

    const after = simnet.callReadOnlyFn(
      'token-y-c4',
      'get-total-supply',
      [],
      deployer
    )
    const afterValue = cvToValue(after.result) as {
      success: boolean
      value: string
    }
    if (!afterValue.success) throw new Error('Expected ok supply response')
    expect(BigInt(afterValue.value)).toBe(BigInt(beforeValue.value) + 3333n)
  })
})
