// Full-screen overlays: death screen, win screen. (The title is the
// splash — see ui/splash.js.)

export function makeScreens(els) {
  const { over, overTitle, overSub, overTip } = els;
  return {
    hideOver() { over.classList.remove('hidden'); over.classList.add('hidden'); },
    showIncidentReport(report, grade, hespeth) {
      overTitle.textContent = 'INCIDENT REPORT';
      overSub.textContent = report + '  — run grade: ' + grade;
      overTip.textContent = hespeth + '\ntap for resurrection (deductible applies)';
      over.classList.remove('hidden');
    },
    showWin() {
      overTitle.textContent = '✦ TICKET #44,107: STAMPED ✦';
      overSub.textContent = 'The Commemorative Medallion is yours. ("It’s a PROP!") …and at center stage of the Victory Site, a trapdoor grinds open. The Downstairs awaits.';
      overTip.textContent = 'tap — then descend. NOW LEAVING: SAFETY.';
      over.classList.remove('hidden');
    },
    showEpilogue() {
      overTitle.textContent = '✦ THE APOCALYPSE IS CANCELLED ✦';
      overSub.textContent = 'The dungeon powers down. The skeletons file for unemployment. The slime intern receives an offer — from the topside. Somewhere, a curse auto-renewal notice returns: "ADDRESS UNKNOWN." TICKET #44,107: CLOSED.';
      overTip.textContent = '*stamp* The Ledger narrates the epilogue. It is, for once, accurate. tap to continue.';
      over.classList.remove('hidden');
    },
    showTransfer() {
      overTitle.textContent = '▣ OWNERSHIP TRANSFERRED ▣';
      overSub.textContent = 'You are the new account holder. The monsters call you "boss." Clerk Hespeth has prepared a greeting. It is: "Oh no. Sir." The dungeon is yours now. The quarterly content refresh is your problem.';
      overTip.textContent = 'NEW GAME+ — roguelike a dungeon you own. tap to begin again.';
      over.classList.remove('hidden');
    },
    closeOver() { over.classList.add('hidden'); }
  };
}
