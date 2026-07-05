# drawer/FEDERATION.md
*Verifiability, fraud proofs, and federated worlds. Supersedes the
"hash-chain now, blockchain never, probably" line in OATH_AND_LEDGER.md
§5 with a more precise position: consensus never touches the live run;
verification and federation may eventually govern everything after it.*

Pull-conditions, tiered:
- **Tier 0 (ships with the society layer, nearly free):** public
  verifier — signed hash-chained logs published per run; a standalone
  replayer tool anyone can execute to recompute final state and check
  checkpoint hashes. Commit-reveal for all hidden information.
- **Tier 1 (pull when purses matter socially):** verification layer
  with a challenge window — checkpoints posted publicly, fraud proofs
  accepted, purses/reputation finalize after the window.
- **Tier 2 (pull only for federation):** multiple independent
  sequencer operators (league-run worlds), portable reputation proofs,
  canonical reducer specification. May never fire. That is fine.

## The split that governs everything

- **Reading is free.** "Anyone can run a node" = anyone can replay.
  Determinism already guarantees it; publishing signed logs is the
  entire feature. No consensus involved.
- **Writing needs an orderer.** The sequencer (host/server) is the one
  trusted party. Consensus exists solely to remove that trust — and
  full consensus is fatal here:
  - Public chains have no fog of war: mempools and state are visible,
    so the traitor, the sealed positions, and per-viewer perception
    all die on a transparent ledger. Law 11 and a public chain are
    incompatible for live play.
  - Finality latency vs. millisecond command commits.
  - Front-running of market settlement and of other players' commands.
  Verdict: **the live run is never on-chain. Not shouldn't — can't.**

## The architecture (rollup pattern)

1. Run executes on a fast sequencer exactly as designed.
2. Hidden information enters the log live as commitments
   (hash + salt); plaintext reveals at run end. The completed log is
   fully verifiable retroactively, having leaked nothing during play.
3. Sequencer posts checkpoint hashes to a public verification layer.
4. Verifier nodes replay finished runs. Any divergence — reordering,
   censorship, minted gold, mis-settlement — yields a **fraud proof**:
   log + public reducer + the point of divergence.
5. Purses and reputation finalize after the challenge window.

Result: trustless settlement and history; fast, private gameplay. The
past is incontrovertible; the present remains a game.

## What it is for: federation

Once runs are verifiable artifacts, anyone can operate a world —
leagues run sequencers, communities fork content packs — and
reputation becomes **portable proof**: oath reliability is not an
operator's database row but a claim any world can verify against
signed logs before admitting you to a posse. The trust economy becomes
a protocol. And the game acquires longevity no operator can revoke:
reducer + content hashes + logs suffice to play and audit forever.

## Laws

1. **No token, ever.** Gold is never tradable outside the game.
   Verification decentralizes truth, not currency. A token reintroduces
   every regulatory and incentive problem this design excluded, and
   kills "the market must never out-pay the game" on contact.
2. **The reducer is a canonical spec with test vectors.** Fraud proofs
   require every implementation (TS, Luau, community nodes) to replay
   bit-identically. Golden seeds graduate from test suite to consensus
   rule. Cross-implementation vector suites are part of Tier 1.
3. **Commit-reveal from day one of the society layer.** All hidden
   state (traitor deals, market positions, sealed whispers) logs as
   commitments live, reveals at run end. Cheap early, miserable to
   retrofit, and it is what makes the public log complete rather than
   redacted.
4. **Sequencer accountability precedes sequencer plurality.** Tier 1
   (one operator, publicly falsifiable) before Tier 2 (many operators).
   Most of the value is in falsifiability, not in plurality.

## What escapes the drawer today

Nothing new beyond what prior docs already claimed: the hash chain
(kernel task K3) and the habit of designing hidden state as
commit-reveal-shaped. One addition to K6 vocabulary:
`COMMITMENT_POSTED {id, hash}` / `COMMITMENT_REVEALED {id, salt,
payload}` — a few schema lines, so the vocabulary is federation-shaped
before federation exists.
