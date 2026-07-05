# drawer/MARKET.md
*In-run prediction markets on run outcomes. Drawer material — deeper in
the drawer than OATH_AND_LEDGER.md, which it depends on.*

Pull-condition: after the society layer (oaths, contribution ledger,
gold with conservation invariant) is live AND has survived at least one
season of exploiters. The market consumes those primitives; building it
first would be building the casino before the town.

What escapes the drawer today: event vocabulary only (extend kernel
schema K6): `MARKET_OPENED {contract, params}`, `POSITION_TAKEN
{player, contract, side, stake, price}`, `MARKET_SETTLED {contract,
outcome, payouts[]}`. Conservation invariant already covers payouts;
rake is a `GOLD_BURNED` sink.

## Why it works here and nowhere else

- **The oracle problem dissolves.** Settlement is a predicate over
  final state; the engine is the oracle; the signed hash-chained log is
  the evidence; any bettor verifies by replaying the public reducer.
  Trustless settlement by construction.
- **Prices are deterministic.** Use an LMSR automated market maker
  (bounded house loss, thin-liquidity friendly). Trades are events;
  price is a pure function of the trade sequence; the entire market is
  replayable like everything else.
- **It is a gold sink and a spectator engine.** Rake burns gold;
  eliminated players and ghosts get a live stake in the run's outcome.
  Revenge-shorting your killer's posse is a feature.
- **The fiction owns it.** The Counting House quotes the odds; the twin
  narrates the tape in bureaucratic deadpan. No new register needed.

## The two hard laws

1. **The market must never out-pay the game.** Stake and position caps
   sized so no participant strategy has higher expected market payoff
   than expected play payoff. You can hedge feelings, not incentives.
2. **Back your oath, never fade it.** Betting for yourself/your posse:
   always legal. Betting against anything you are sworn to: either
   rejected at the validator, or — preferred — legal, and stamped on
   your permanent record at settlement.

## Insider information as legible treachery

The game manufactures insiders by design (the traitor knows). Do not
pretend otherwise; weaponize it:
- Positions are private during the run, public at settlement.
- `MARKET_POSITION_AGAINST_SWORN_ALLY` becomes reputation-ledger
  evidence — pre-registered betrayal, readable by leagues forever.
- Market movement is therefore *information*: the tape becomes part of
  the deduction game. The insider profits once and wears it always.

## Contract menu (v1, conservative)

- player X extracts
- posse Y extracts
- winner's alignment is Z
- extraction happens at all (vs. the light dies)

Deferred/spicy: "betrayal occurs" (the paranoia index) — markets on
negative events pay people to cause them; if ever shipped, spectators
and eliminated only, never the sworn. First blood, relic-stolen-once:
same review.

## Anti-abuse posture

- Rake on every market; position limits per account; stake caps scaled
  to purse (Law 1).
- Alt-resistance via reputation-weighted stake ceilings and account
  maturity — mitigation, not solution; monitor before hardening.
- No markets created by players in v1; house contracts only (player-
  created markets are a Goodhart factory — separate future review).
- Settlement disputes: none possible in principle (replay), but publish
  the settlement predicate per contract with the market.

## Platform boundary

Gold-only, forever, on the flagship platform. This feature specifically
does NOT port to Roblox in any Robux-adjacent form — platform gambling
policies prohibit wagering even around in-experience currencies in most
readings; assume "no," verify at port time, and design the port to strip
the market cleanly (it is a log consumer; stripping it changes nothing).
