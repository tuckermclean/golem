# drawer/EXCHANGE.md
*When gold gets a price. Not a feature — a weather forecast, and the
posture for surviving it. Companion to OATH_AND_LEDGER.md §5 and
FEDERATION.md.*

Trigger, not pull-condition: this file activates the day third-party
markets price gold, which the operator neither schedules nor permits.
Design as if that day comes; never promise that it will.

## The facts of life

1. **External pricing is not a decision the operator makes.** Scarce +
   transferable + demanded ⇒ someone custodies gold and trades claims
   on it (OTC, IOUs, wrapped tokens). Every major game economy that met
   those conditions acquired a street price against its operator's
   wishes.
2. **Our own verifiability accelerates it.** Anyone-can-replay means a
   custodian can prove reserves from signed logs — the verification
   layer doubles as third-party proof-of-reserves. The integrity built
   for the trust economy is precisely what makes external collateral
   credible. Accept the irony; do not weaken verification to fight it.
3. **What breaks is every law denominated in gold.** A real exchange
   rate re-denominates stakes in currency: purses become wages
   (farming, botting, boosting, account markets), oath betrayal
   becomes theft-with-a-dollar-figure, and the prediction market's
   "only game gold" firewall erodes in proportion to liquidity
   (regulators look through the token to the value — the skin-gambling
   lesson).

## The posture: the one-way valve

Of the four postures — fight (non-transferable gold: kills the society
layer), prohibit-and-whack-a-mole (black market harms without
legibility), full embrace (money-services business; the token problem
resurrected) — the defensible one is EVE's:

**The Writ of the Counting House.** The operator sells Writs (premium
instrument) for real money; players sell Writs for gold in-game; gold
never converts out through any operator door. Money in, never out.
- Soft, visible price floor; undercuts third-party RMT on safety and
  price; funds the game.
- Keeps the operator inside the closed-loop line that gambling and
  money-transmission regulation actually polices. (Not legal advice;
  the boundary gets counsel before the valve opens.)
- Does not prevent gray-market cash-out via custodians. Nothing does.
  The goal is that the operator never touches it and the economy is
  built to survive it.

## Design consequences (apply BEFORE the trigger; retrofits are ugly)

- **Emission through society.** The daily purse is the serious faucet:
  fixed, contested, high-visibility — a block reward whose proof-of-
  work is playing well with people who trust you. Farming it means
  weeks of performed reliability with reputation-gated counterparties,
  i.e., playing the game — the only anti-botting victory condition
  that has ever held.
- **Solo faucets small and capped, forever.** Whatever loop is
  grindable alone at scale is the loop the sweatshop finds first.
  Audit every faucet with the question "what does this pay per
  bot-hour?"
- **Sinks are monetary policy:** market rake, Counting House interest,
  ritual costs, cosmetics. Track faucet/sink balance as a dashboard
  from the society layer's first day.
- **Stake caps get a second denominator.** "Market must never out-pay
  the game" holds internally by construction; externally it holds only
  if emission is slow enough that dollar-EV of any strategy stays
  gameplay-dominated. Emission schedule is therefore a security
  parameter, not a tuning knob.
- **Revisit the market and geo-posture at trigger time.** Liquid
  external pricing may force jurisdiction gating or contract-menu
  narrowing on the prediction market specifically.
- **Account/reputation markets are the unsolved residual** (true of
  every reputation system everywhere). Mitigations to study, not
  promise: reputation decay without play, identity binding for
  league officers, velocity limits on high-rep account transfer of
  gold. Named here so nobody pretends it is solved.

## Laws (additions)

1. **No operator cash-out door, ever.** The valve is one-way by law,
   not by policy mood. (Extends the no-token law.)
2. **Never weaken verification to fight externality.** Integrity is
   the product; opacity is not a defense, only a different failure.
3. **Emission is a security parameter.** Changes to faucets follow the
   same review discipline as changes to the reducer.
