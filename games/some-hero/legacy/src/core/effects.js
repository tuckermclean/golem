// The "effects" interface is how pure game systems request side effects
// (sound, toasts, HUD refreshes, screen transitions) without touching the
// DOM or WebAudio. main.js supplies the real implementation; tests supply
// spies or just use the no-op defaults below.

export function makeEffects(overrides = {}) {
  return {
    sfx(name) {},          // play a named sound: swing, hit, hurt, coin, heal,
                           // level, talk, boss, win, push, ignite, douse
    toast(msg) {},         // transient on-screen message
    hudChanged() {},       // hp / xp / gold / potions / sword changed
    questChanged() {},     // quest stage changed (overworld quest label)
    setQuestHTML(html) {}, // live per-frame quest line (tomb)
    nearNpc(npcOrNull) {}, // for the TALK/ATTACK button label
    requestTalk(npc) {},   // player pressed interact next to an NPC
    onPlayerDeath() {},    // hp hit zero
    onAmuletFound() {},    // overworld guardian's amulet collected (win screen)
    onEpilogue() {},       // ending A: the apocalypse is cancelled
    onTransfer() {},       // ending B: ownership transferred (New Game+)
    onGolemEntry(missing) {},   // blocked at the dungeon mouth; missing credentials
    onGolemApproval(done) {     // the stamp ceremony (exactly once; the pause is
      done && done();           // sacred). Entry waits for `done` — the screen must
    },                          // not give the verdict away before the golem does.
    onGolemCustoms(gold, done) { // surfacing with dungeon gold; inspection happens
      done && done();            // AT the door — `done` releases you into daylight
    },
    onRiddle() {},              // the riddle door has a question
    ...overrides
  };
}
