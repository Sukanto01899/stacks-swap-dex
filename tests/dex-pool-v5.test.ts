import { describe, expect, it } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";

const TOKEN_X = "dex-token-x";
const TOKEN_Y = "dex-token-y";
const POOL = "dex-pool-v5";

const tokenXTrait = (deployer: string) => Cl.contractPrincipal(deployer, TOKEN_X);
const tokenYTrait = (deployer: string) => Cl.contractPrincipal(deployer, TOKEN_Y);

const normalizeCv = (value: unknown): unknown => {
  if (!value || typeof value !== "object") return value;

  const typed = value as { type?: string; value?: unknown };
  if (typed.type === "uint") return BigInt(String(typed.value));
  if (typed.type === "int") return BigInt(String(typed.value));
  if (typed.type === "bool") return typed.value;
  if (typed.type === "principal") return typed.value;
  if (typed.type?.startsWith("(optional")) return normalizeCv(typed.value);
  if ("value" in typed) return normalizeCv(typed.value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      normalizeCv(entry),
    ]),
  );
};

const readOnlyValue = (result: unknown) =>
  normalizeCv(cvToValue(result as Parameters<typeof cvToValue>[0])) as Record<
    string,
    unknown
  >;

const mintBothTokens = (deployer: string, recipient: string, amount: bigint) => {
  expect(
    simnet.callPublicFn(
      TOKEN_X,
      "mint",
      [Cl.uint(amount), Cl.principal(recipient)],
      deployer,
    ).result,
  ).toBeOk(Cl.bool(true));

  expect(
    simnet.callPublicFn(
      TOKEN_Y,
      "mint",
      [Cl.uint(amount), Cl.principal(recipient)],
      deployer,
    ).result,
  ).toBeOk(Cl.bool(true));
};

const initializePool = (deployer: string, owner: string, amountX: bigint, amountY: bigint) => {
  return simnet.callPublicFn(
    POOL,
    "initialize-pool",
    [
      tokenXTrait(deployer),
      tokenYTrait(deployer),
      Cl.bool(false),
      Cl.bool(false),
      Cl.uint(amountX),
      Cl.uint(amountY),
    ],
    owner,
  );
};

describe("dex-pool-v5", () => {
  it("initializes the pool and records LP ownership", () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get("deployer");
    const wallet1 = accounts.get("wallet_1");

    if (!deployer || !wallet1) throw new Error("Missing test accounts");

    mintBothTokens(deployer, wallet1, 50_000n);

    const init = initializePool(deployer, wallet1, 10_000n, 10_000n);
    expect(init.result).toBeOk(
      Cl.tuple({
        shares: Cl.uint(390_708),
        x: Cl.uint(10_000),
        y: Cl.uint(10_000),
      }),
    );

    expect(
      simnet.callReadOnlyFn(POOL, "get-total-supply", [], deployer).result,
    ).toBeUint(390_708);
    expect(
      simnet.callReadOnlyFn(
        POOL,
        "get-lp-balance",
        [Cl.principal(wallet1)],
        deployer,
      ).result,
    ).toBeUint(390_708);

    const reserves = readOnlyValue(
      simnet.callReadOnlyFn(POOL, "get-reserves", [], deployer).result,
    ) as { x: bigint; y: bigint };

    expect(reserves.x).toBe(10_000n);
    expect(reserves.y).toBe(10_000n);

    const contractInfo = readOnlyValue(
      simnet.callReadOnlyFn(POOL, "get-contract-info", [], deployer).result,
    ) as {
      "fee-recipient": string;
      "total-supply": bigint;
    };

    expect(contractInfo["fee-recipient"]).toBe(wallet1);
    expect(contractInfo["total-supply"]).toBe(390_708n);
  });

  it("quotes and executes swap-x-for-y while accruing token-x fees", () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get("deployer");
    const wallet1 = accounts.get("wallet_1");
    const wallet2 = accounts.get("wallet_2");

    if (!deployer || !wallet1 || !wallet2) throw new Error("Missing test accounts");

    mintBothTokens(deployer, wallet1, 100_000n);
    mintBothTokens(deployer, wallet2, 20_000n);
    initializePool(deployer, wallet1, 10_000n, 10_000n);

    const quote = readOnlyValue(
      simnet.callReadOnlyFn(POOL, "quote-x-for-y", [Cl.uint(1_000)], deployer)
        .result,
    ) as { dy: bigint; fee: bigint };

    expect(quote.dy).toBe(906n);
    expect(quote.fee).toBe(3n);

    const swap = simnet.callPublicFn(
      POOL,
      "swap-x-for-y",
      [
        tokenXTrait(deployer),
        tokenYTrait(deployer),
        Cl.uint(1_000),
        Cl.uint(900),
        Cl.principal(wallet2),
        Cl.uint(999_999),
      ],
      wallet2,
    );

    expect(swap.result).toBeOk(
      Cl.tuple({
        dx: Cl.uint(1_000),
        dy: Cl.uint(906),
        fee: Cl.uint(3),
        recipient: Cl.principal(wallet2),
      }),
    );

    const reserves = readOnlyValue(
      simnet.callReadOnlyFn(POOL, "get-reserves", [], deployer).result,
    ) as { x: bigint; y: bigint };
    expect(reserves.x).toBe(10_997n);
    expect(reserves.y).toBe(9_094n);

    const feeInfo = readOnlyValue(
      simnet.callReadOnlyFn(POOL, "get-total-fees", [], deployer).result,
    ) as { "fees-x": bigint; "fees-y": bigint };
    expect(feeInfo["fees-x"]).toBe(3n);
    expect(feeInfo["fees-y"]).toBe(0n);

    expect(
      simnet.callReadOnlyFn(
        TOKEN_Y,
        "get-balance",
        [Cl.principal(wallet2)],
        deployer,
      ).result,
    ).toBeOk(Cl.uint(20_906));
  });

  it("adds and removes liquidity proportionally", () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get("deployer");
    const wallet1 = accounts.get("wallet_1");
    const wallet2 = accounts.get("wallet_2");

    if (!deployer || !wallet1 || !wallet2) throw new Error("Missing test accounts");

    mintBothTokens(deployer, wallet1, 100_000n);
    mintBothTokens(deployer, wallet2, 100_000n);
    initializePool(deployer, wallet1, 10_000n, 10_000n);

    const add = simnet.callPublicFn(
      POOL,
      "add-liquidity",
      [
        tokenXTrait(deployer),
        tokenYTrait(deployer),
        Cl.uint(5_000),
        Cl.uint(5_000),
        Cl.uint(5_000),
      ],
      wallet2,
    );
    expect(add.result).toBeOk(
      Cl.tuple({
        shares: Cl.uint(195_354),
        x: Cl.uint(5_000),
        y: Cl.uint(5_000),
      }),
    );

    expect(
      simnet.callReadOnlyFn(
        POOL,
        "get-lp-balance",
        [Cl.principal(wallet2)],
        deployer,
      ).result,
    ).toBeUint(195_354);

    const remove = simnet.callPublicFn(
      POOL,
      "remove-liquidity",
      [
        tokenXTrait(deployer),
        tokenYTrait(deployer),
        Cl.uint(97_677),
        Cl.uint(2_500),
        Cl.uint(2_500),
      ],
      wallet2,
    );
    expect(remove.result).toBeOk(
      Cl.tuple({
        shares: Cl.uint(97_677),
        x: Cl.uint(2_500),
        y: Cl.uint(2_500),
      }),
    );

    expect(
      simnet.callReadOnlyFn(
        POOL,
        "get-lp-balance",
        [Cl.principal(wallet2)],
        deployer,
      ).result,
    ).toBeUint(97_677);

    const reserves = readOnlyValue(
      simnet.callReadOnlyFn(POOL, "get-reserves", [], deployer).result,
    ) as { x: bigint; y: bigint };
    expect(reserves.x).toBe(12_500n);
    expect(reserves.y).toBe(12_500n);
  });

  it("rejects expired swap deadlines", () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get("deployer");
    const wallet1 = accounts.get("wallet_1");
    const wallet2 = accounts.get("wallet_2");

    if (!deployer || !wallet1 || !wallet2) throw new Error("Missing test accounts");

    mintBothTokens(deployer, wallet1, 50_000n);
    mintBothTokens(deployer, wallet2, 10_000n);
    initializePool(deployer, wallet1, 10_000n, 10_000n);

    const swap = simnet.callPublicFn(
      POOL,
      "swap-y-for-x",
      [
        tokenXTrait(deployer),
        tokenYTrait(deployer),
        Cl.uint(1_000),
        Cl.uint(1),
        Cl.principal(wallet2),
        Cl.uint(0),
      ],
      wallet2,
    );

    expect(swap.result).toBeErr(Cl.uint(102));
  });

  it("allows current fee recipient to update fee-recipient", () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get("deployer");
    const wallet1 = accounts.get("wallet_1");
    const wallet2 = accounts.get("wallet_2");

    if (!deployer || !wallet1 || !wallet2) throw new Error("Missing test accounts");

    mintBothTokens(deployer, wallet1, 50_000n);
    initializePool(deployer, wallet1, 10_000n, 10_000n);

    expect(
      simnet.callPublicFn(POOL, "set-fee-recipient", [Cl.principal(wallet2)], wallet2)
        .result,
    ).toBeErr(Cl.uint(207));

    expect(
      simnet.callPublicFn(POOL, "set-fee-recipient", [Cl.principal(wallet2)], wallet1)
        .result,
    ).toBeOk(
      Cl.tuple({
        previous: Cl.principal(wallet1),
        recipient: Cl.principal(wallet2),
      }),
    );

    const contractInfo = readOnlyValue(
      simnet.callReadOnlyFn(POOL, "get-contract-info", [], deployer).result,
    ) as {
      "fee-recipient": string;
    };

    expect(contractInfo["fee-recipient"]).toBe(wallet2);
  });
});
