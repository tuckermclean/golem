# drawer/CREDIT.md
*Credit unions, lending, and debt. Drawer material — same stratum as
MARKET.md; both depend on OATH_AND_LEDGER.md.*

Pull-condition: after gold is live with the conservation invariant and
league treasuries exist. League-treasury lending ships first (it is the
smallest credit union); the house lender and inter-union anything come
later, if ever.

What escapes the drawer today: event vocabulary only (extend K6):
`LOAN_ISSUED {lender, borrower, principal, rate, term, terms_hash}`,
`LOAN_REPAID {loan, amount}`, `LOAN_DEFAULTED {loan}`,
`LIEN_ATTACHED {loan, target}`, `GARNISHMENT_APPLIED {loan, source,
amount}` — plus a `debt:` delta namespace (claims, distinct from
balances).

## The two laws

1. **Debt is a claim, not a balance.** Gold is never created by
   lending. Full-reserve only: every loan is a transfer of real,
   deposited gold plus a recorded lien. The conservation invariant
   (`sum(balances) == minted − burned`) remains a CI test with a
   functioning banking sector — claims are tracked in `debt:`, never
   counted as money.
2. **No borrowed gold enters the market.** Productive credit (gear,
   light, run entry) is the purpose; leverage into prediction markets
   is banned. Enforcement: outstanding debt zeroes or proportionally
   reduces the account's market stake cap (fungibility makes tracing
   pointless; cap the account, not the coins).

## Underwriting is reading the ledger

- The reputation card is the credit score: oaths honored, contracts
  kept, extraction rate, escort success, defaults — all on-log, all
  replayable. Rates are a published function of history; disputes are
  settled by replay. No black boxes.
- Quoting a rate is social gameplay: the loan officer (league
  treasurer, or the house) sees your card before you speak. The twin
  voices the negotiation in the established bureaucratic register.

## The institutions

- **League credit unions.** The league treasury (already specced: 20%
  treasury, 10% dividend) is a member-owned lender: deposits from the
  treasury and members, loans to members, dividends from interest.
  Leagues are proto-banks; this formalizes them. v1: treasury lends,
  third-party deposits deferred (avoids bank-run dynamics initially).
- **The house lender.** The First Counting House of Greater Pflum —
  SOME HERO's credit/APR satire made mechanical. Lender of last resort
  for the reputationless, at punitive published rates. Content already
  exists; this is promotion, not invention.

## Default and enforcement

- Liens attach at the validator: `GARNISHMENT_APPLIED` intercepts
  `PURSE_DISTRIBUTED` before gold reaches the debtor. Undramatic,
  automatic, incontestable (it is in the reducer).
- Default stains the card permanently and reprices all future credit.
  In a trust economy the collector is your own history — no kneecap
  mechanics required.
- Debtor status is public (like all reputation), exact balances are
  not.

## Usury and the moral ledger

The real-world usury debate is fuzzy because default risk is unknowable
from outside — "risk pricing" and "gouging" are observationally
identical. Here they are not: the engine computes default risk from the
reputation card via the same published function that underwrites the
loan. Therefore the **actuarially fair rate is computable and public**,
and usury becomes a crisp predicate:

    spread = rate − (fair_rate + declared_costs)

Three tiers, as an authored alignment-adjudication table (per the
alignment drawer's structure — this is evidence, not a score):

- **Charity** — lend below cost, or `DEBT_FORGIVEN`: mercy/generosity
  evidence. Forgiveness is among the strongest mercy events in the
  vocabulary; leagues may declare jubilee.
- **Commerce** — rate ≈ fair_rate + costs: neutral. No evidence either
  way. This is the scholastic *interesse* carve-out, computable.
- **Usury** — positive spread: `USURY_TAKEN {rate, fair_rate, spread,
  borrower_alternatives}` on the lender's permanent card, weighted by
  the borrower's alternatives and need (same structure as
  `safer_route_available` in the alignment tables). Extraction from a
  cornered borrower weighs heavier than the same spread offered to a
  solvent one with options.

Contested interpretation applies: the church reads sin, the market
reads a spread, the borrower's league reads an insult — same event,
different institutional lenses, no universal moral narrator. The twin
voices each institution's reading; the engine only publishes the
number.

Institutional differentiation falls out for free: the Lawful Good
union lends at cost and forgives on hardship; Chaotic Good forgives
unpredictably; Lawful Evil never exceeds the fair rate and has never
forgiven a grain — legal, merciless, and visible on the card. The
First Counting House posts its spread in the lobby.

## Deferred spice (drawer-of-drawers)

- Player-role debt collectors / bounty assignments on defaulters.
- Third-party deposits → bank runs → union failures as social events →
  deposit-insurance satire. Requires a mature economy and a taste for
  chaos; record, do not build.
- Inter-union lending, syndicated loans for league war chests.
- Secured loans with item collateral (needs item escrow semantics).

## Interactions on record

- Market: Law 2 above; additionally a debtor's positions (like all
  positions) publish at settlement — borrowing while shorting your
  own posse is the worst card in the game.
- Alignment (when pulled): repayment reliability is lawfulness
  evidence; strategic default while solvent is its own event.
- Roblox port: lending in-experience gold likely survives policy where
  wagering does not, but verify; the feature strips cleanly regardless
  (log consumer + validator hook).
