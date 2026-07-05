# drawer/OATH_AND_LEDGER.md
*The society layer: contribution, oaths, reputation, gold, and the port
strategy. Drawer material — recorded now, built on pull-condition.*

Pull-condition: after The Ceremony ships AND golem-grid has proven the
protocol over real networks with strangers. Until then, only the event
vocabulary below escapes the drawer (schema is free; societies are not).

## 1. The one law that escapes the drawer today

**Attribution is part of the event, written by the validator, never
inferred later.** When the authority commits a milestone or a creditable
act, it stamps provenance at that moment — whose knowledge contained the
solution, who executed, who held the gate — with the same authority that
stamps the sequence number. Post-hoc causal mining of a raw log is a
research problem; provenance-at-commit is a struct field.

Event vocabulary to shape into the kernel schema now (fields, not
systems): attribution fields on combat/heal/defend events (`actor`,
`beneficiary`, `attacker`, `preventedDamage`, proximity, timing);
milestone events with weighted `contributors[]`; oath events
(`OATH_SWORN`, `OATHBROTHER_ATTACKED`, `POSSE_MEMBER_KILLED`,
`OATH_BETRAYED`, `SOLE_CLAIM_CREATED`); economy events (`GOLD_MINTED`,
`GOLD_BURNED`, `GOLD_TRANSFERRED`, `PURSE_DISTRIBUTED`).

## 2. The contribution ledger

A pure consumer of canonical events, sibling of the renderer and the
narrator, never touching the reducer:

    canonical events ─┬─ world reducer
                      ├─ renderer(s)
                      ├─ narrator (twin)
                      └─ contribution ledger → roles, reputation,
                                               leaderboards, payouts

Roles are derived, never selected: Pioneer, Solver, Supporter, Defender,
Escort, Scout, Saboteur, Pirate, Interceptor, Martyr, Opportunist —
overlapping vectors computed from attributed events. Credit requires
consequence (pirate credit = possession taken AND retained/extracted;
attempted griefing earns notoriety, not payout).

Anti-Goodhart doctrine: credit only *authored* creditable acts
(validator-recognized patterns: gate held during crossing, damage
intercepted for carrier, resurrection performed, milestone provenance) —
no general counterfactual formula. Publish the categories, never the
coefficients; rotate coefficients seasonally. Live scores hidden until
the run ends. Every metric must survive contact with exploiters before
it is worth anything.

Reputation cards over labels: alignment plus the receipts (oaths sworn/
completed/betrayed, escort success rate, contracts honored, sworn allies
eliminated, sole-claim extractions). The engine never moralizes; it
publishes statistics and the players moralize. Alignment as collateral:
reputation is the bond you post to enter economic relationships.

Normalize for opportunity: lifetime, season, per-run rate, success rate,
confidence-weighted ratings for rare roles.

## 3. The posse oath

A blood oath recognized by the world for the duration of the run:

    POSSE OATH
    Duration:      entire run
    Share:         equal among eligible sworn members
    Withdrawal:    impossible
    Expulsion:     impossible
    Renegotiation: impossible
    Friendly fire: permitted
    Betrayal:      mechanically possible, morally catastrophic
    Termination:   run ends, or all other members eliminated

Membership locks before the relic is claimed; joining requires unanimous
consent; all oath state is public. If any sworn member extracts, every
surviving sworn member shares equally — regardless of who solved, who
slept, who carried, who died. That unfairness is the price of the oath.

Betrayal is a third act, not a button: the traitor must eliminate all
sworn companions AND keep them eliminated through extraction. Ordinary
death does not void a share; **final elimination** does (resurrection
window expired at extraction, or run-specific banishment). Treachery
therefore has a duration — a visible window where the feed announces
`OATHBROTHER_ATTACKED` and everyone knows what is happening. Alignment
consequences are enormous and asymmetric by temperament (Lawful Evil
honors the sworn oath and preys outside it; Chaotic Evil swears
sincerely for three hours).

The artifact may react per its own alignment (heavier in a traitor's
hands, calls dead posse members by name, or — Chaotic Evil relic —
"At last, you have understood ownership."). Engine decides mechanics;
twin gives it the voice.

## 4. Leagues

The persistent institution between runs: membership standards gated on
receipts (oath reliability, betrayal history), treasury, seasonal
rankings, standard posse terms, ideological identity. Leagues reject bad
counterparties, not bad people — the trust economy is actuarial, not
moral. Gratuities and contribution awards exist primarily for outsiders
(mercenaries, scouts, independent defenders); sworn members share by
oath, never by gratuity.

Prototype payout shape (when payouts exist at all):
claimant/posse ~80%, essential milestone contributors ~15%,
winner-directed gratuity to eligible outsiders ~5%. Track all role
statistics from day one; attach value to almost none of them at first.

## 5. Gold — the economy is the event log

Gold is a unit of account, in-world, engine-native:

- Balances are delta keys; transfers, purses, faucets and sinks are
  events; payouts are reducer operations.
- **Conservation invariant as CI test:** sum(balances) == minted −
  burned, asserted on every replay. Economy exploits are failing tests.
- Tamper-evidence, not consensus: each event hashes its predecessor;
  the authority signs periodic checkpoints. Any dispute is settled by
  replaying the signed log through the public reducer — verification by
  determinism. No blockchain: consensus solves "no trusted authority,"
  and we have one. Revisit only for federated operator-less hosting
  (and even then, prefer running a server).
- The fiction already is the economy: the Counting House, the Final
  Ledger, credit/APR satire, customs seals, the Ledger itself. Surface
  the economy through the existing bureaucratic register.
- Real-money anything is a launch decision, never an architecture
  decision. Design money-agnostic; let lawyers gate the boundary later.

## 6. The Roblox port strategy

Prove the design on the flagship platform, then port to where players
already are. Feasibility is guaranteed by the constitution:

- Kernel ports: pure identity-blind reducer + worldgen rewrite in Luau
  (deterministic pure functions port mechanically). Authority moves to
  the Roblox server, where it natively lives. Content packs compile to
  Luau tables. Protocol maps onto Roblox networking.
- The twin does NOT port (no WASM/native code). Law 10 — fully playable
  with narration off, template fallback always present — is the port's
  feasibility guarantee. Language tiers 0–2 (parser, classifier) port;
  tier 3 degrades to seeded templates or platform AI APIs at port time.
- Robux is boundary-only: platform policy has historically prohibited
  wagering/prize-paying Robux (gambling territory) and constrains
  player-to-player transfer. The compliant shape is the one already
  designed — in-experience gold for all purses/oaths/ledgers, Robux for
  cosmetics/passes at the edge, revenue via DevEx. Verify current
  policy at port time; the money-agnostic design keeps this a boundary
  swap, not a redesign.

## 7. What this layer is

The extraction crawl grown into a society: one player claims the relic,
but the world remembers who found the road, who held the line, who
betrayed the expedition. The question the oath forces — "who am I
willing to make financially equal to me, with no escape except death?" —
is the endgame the engine exists to make terrifying. It waits its turn.
