# drawer/DAY.md
*The daily world and the gold loop. The overworld is eternal; the
underworld is mortal; gold is what migrates between them. Companion to
OATH_AND_LEDGER.md, EXCHANGE.md.*

Pull-condition: with the society layer. This file defines the game those
institutions inhabit; several of its rules (emission streaming, sink
classes) are prerequisites for EXCHANGE.md's posture and should be built
with, not after, gold itself.

## The two regimes

- **Overworld:** persistent forever. Respawn point, social hub, market
  row, league halls. Deltas never reset (profile/world persistence
  tiers). Where gold is SPENT.
- **Underworld:** the daily dungeon. Lifetime = min(midnight,
  extraction). All underworld deltas die at reset. Where gold is
  EARNED.
- **The law of the map: the underworld mints, the overworld burns.**
  Geography is the monetary policy. Gold's role is cosmological: the
  only thing that survives passage from the mortal world to the
  eternal one.

## The ripening relic (emission)

The daily gold budget streams into the active relic at a constant rate.
- Extract early: lean purse, weak field. Let it ripen: fat purse, deep
  rivals, a traitor with a plan. "When do we take it?" is the day's
  central drama, for free.
- Emission per day is constant by construction — the security
  parameter EXCHANGE.md requires — regardless of how many dungeons
  cycle.
- Unclaimed at midnight: the purse rolls into tomorrow's relic.
  Jackpot days after brutal seeds are server events.
- Extraction ends everyone's day: rivals' progress evaporates. Rival
  intel becomes valuable; the expedition share (essential milestone
  contributors paid across crew lines) becomes load-bearing
  compensation for the crews that opened the road.

## What gold buys (the three hungers)

1. **Recurring need — provisioning.** Torches, rations, rope,
   resurrection tokens, tools: bought topside, consumed below, gone at
   reset. Base demand; even the rich re-provision daily.
   Law: provisioning buys preparation, never power — hard caps so
   wealth cannot compound into an unbeatable kit. Death respawns you
   topside with kit spent; re-entry costs preparation, never a fee.
2. **Lateral flow — services.** Mercenary escorts, scouts' maps, safe
   passage, bonds, escrow, commissioned rescues, player-posted jobs.
   Lateral flow is what makes gold money rather than points, and it is
   where side quests should mostly live: players paying players.
   Operator solo quests stay small and daily-capped (anti-farming law).
3. **Permanence — the overworld sink.** Stalls, league halls,
   monuments, statues for great extractions, named landmarks, vaults;
   rituals at the top (banishment rites, jubilees, league charters).
   Property converts gold into visible, persistent status — the real
   currency of a trust economy — and status advertises
   trustworthiness, which loops back into earning. Not pay-to-win:
   pay-to-be-seen.

## The day, as a loop

wake (eternal city) → spend: provision, hire, build → descend (mortal
world) → earn: milestones, escorts, the ripening relic → extract or
die → return → convert winnings to permanence → midnight: the
underworld forgets; the overworld remembers.

## Guardrails

- Faucets: relic stream + expedition/valor shares + capped dailies +
  player-posted jobs (which are transfers, not emission). Nothing else.
- Sinks: provisioning, rake, Counting House interest, property,
  rituals, cosmetics. Dashboard faucet/sink balance from day one.
- No power compounding: caps on kit, no permanent stat purchases;
  meta-progression spends knowledge and reputation, not gold.
- Death stings (kit lost, walk of shame) but is never paywalled.
- Respawn topside interacts with final-elimination rules
  (OATH_AND_LEDGER.md §3): underworld resurrection windows are the
  oath-betrayal clock; overworld respawn is unconditional.

## Event vocabulary (escapes today, extends K6)

RELIC_RIPENED {amount, total} (periodic stream ticks),
PURSE_ROLLED_OVER {from_run, amount}, KIT_PURCHASED {items, cost},
JOB_POSTED / JOB_COMPLETED {poster, worker, bounty},
PROPERTY_CLAIMED / PROPERTY_IMPROVED {parcel, cost},
RITUAL_PERFORMED {kind, cost}. Schema only; no systems.
