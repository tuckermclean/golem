// All hub dialogue. Content only — dialog-box mechanics live in
// ui/dialog.js, quest/gold mutations go through the systems.
//
// Tone rules apply: every named character has a bit, a catchphrase, and
// one wrong belief they will defend forever.

import { startHunt, claimReward } from '../systems/quest.js';
import { hespethLine } from './hespeth.js';
import { grantBackstory } from '../systems/credentials.js';
import { addMenace, grantToken } from '../core/meta.js';
import { ledgerize } from '../systems/ledger.js';
import { canBorrow, borrow, payDown, aprFor, tierName, creditLimit, minPayment, truthInLending } from '../systems/credit.js';
import { makeSkullPuzzle, skullAgree, skullCorrect, gradeFirstPet, trySignature, MENACE_THRESHOLD } from '../systems/heist.js';
import { deskStatus, applyCancel, applyTransfer } from '../systems/endgame.js';

const pct = apr => (apr * 100).toFixed(2) + '%';

/** The decline letters. Each reason gets the dignity of specificity. */
function declineText(reason, meta) {
  if (reason === 'no income') return 'DECLINED: NO VERIFIABLE INCOME. The Guild pays bounties. Geese are out there. Geese are income.';
  if (reason === 'delinquent') return 'Your file has a sticker on it. The sticker is red. I\'m sorry.';
  if (reason === 'score') return 'DECLINED: score below 500. The form I\'m required to slide across the counter says "we believe in you," and then lists, at length, why we don\'t.';
  return 'DECLINED: that would exceed your limit of ' + creditLimit(meta) + ' g. The limit believes in you exactly four times your income.';
}

export function talkTo(n, game, dialog, fx) {
  const quest = game.quest, player = game.player, meta = game.meta;

  if (n.name === 'Clerk Hespeth') {
    if (quest.stage === 0) dialog.say(n.name, [
      hespethLine(meta.deaths),
      'TICKET #44,107. "Go downstairs and cancel the apocalypse. Should be quick." *stamp*',
      'Before the Guild insures you for the Downstairs, prove you can handle pests. Five of the geese. Legally they are not pests — they are "an ongoing incident." Stampathy believes in you. Stampathy is a stamp.',
      'The Guild does not issue weapons. Budget. There\'s a fellow in the west meadow with… opinions about sticks. I\'d go see him before you go see a goose.'
    ], () => { startHunt(quest); fx.questChanged(); });
    else if (quest.stage === 1) dialog.say(n.name, [
      'The geese. ' + (quest.need - quest.kills) + ' more. You won\'t have to find them. That is the one mercy of geese. I have prepared the stamp.'
    ]);
    else if (quest.stage === 2) dialog.say(n.name, [
      'Five geese. Verified. Stamped. *stamp* That one wasn\'t necessary. *stamp* Neither was that.',
      'Fifteen gold, hazard rate. The hazard rate went down. You survived, so clearly it wasn\'t hazardous. Also: this is payroll, which means you now have verifiable income. The gift shop will explain why that matters. At length.',
      'Now: the Reenactor holds the Victory Site northeast. He has performed the Battle of Greater Pflum daily for forty years. Both sides. Alone. Your ticket is, apparently, a prop he needs.',
      'When he charges — he announces it first. Loudly. It\'s theater. You\'ll know.'
    ], () => { claimReward(game); fx.sfx('coin'); fx.hudChanged(); fx.questChanged(); });
    else if (quest.stage === 3) {
      if (!meta.credentials.backstory) {
        dialog.say(n.name, [
          'The Reenactor. Northeast. Buy Glurp first. (See label.)',
          'Also: the Door Golem will want a notarized tragic backstory before the Downstairs. The Ledger has\u2026 volunteered to write yours. It\'s been waiting. It has drafts.'
        ], () => {
          dialog.setSpeaker(n.name);
          dialog.setText('Shall I notarize the Ledger\u2019s draft? You don\u2019t get to read it first. Those are the rules. The Ledger made the rules.');
          dialog.open();
          dialog.choice([
            { label: '\u{1F4D6} Notarize it · free', fn: () => {
              grantBackstory(meta);
              fx.sfx('level');
              dialog.setText(ledgerize('*stamp* Done. Excerpt: "Our hero\u2019s original village was definitely eaten by a sadness. Possibly a lake. The Ledger was not there but feels strongly." \u2014 It\u2019s notarized. I\u2019m sorry.'));
              dialog.showHint();
            }},
            { label: 'Not yet', fn: () => {
              dialog.setText('Stampathy will wait. Stampathy is patient. I am also those things, technically.');
              dialog.showHint();
            }}
          ]);
        });
      } else dialog.say(n.name, [
        'The Reenactor. Northeast. Buy Glurp first. (See label.)',
        'Deaths on file: ' + meta.deaths + '. Day ' + meta.day + '. Body bin\'s where it always is.'
      ]);
    }
    else {
      if (!meta.credentials.backstory) {
        dialog.say(n.name, [
          hespethLine(meta.deaths),
          'The Door Golem won\'t let you Downstairs without a notarized tragic backstory. The Ledger has a draft. The Ledger has SEVERAL drafts.'
        ], () => {
          dialog.setSpeaker(n.name);
          dialog.setText('Notarize the Ledger\u2019s draft?');
          dialog.open();
          dialog.choice([
            { label: '\u{1F4D6} Notarize it · free', fn: () => {
              grantBackstory(meta);
              fx.sfx('level');
              dialog.setText(ledgerize('*stamp* Notarized. The original draft was longer. You\u2019re welcome.'));
              dialog.showHint();
            }},
            { label: 'Not yet', fn: () => { dialog.setText('Body bin\'s where it always is.'); dialog.showHint(); }}
          ]);
        });
      } else {
        const lines = [
          hespethLine(meta.deaths),
          'Ticket\'s stamped. The cancellation desk is on the bottom floor. Behind the boss. Of course it is. Day ' + meta.day + ', if you\'re keeping count. The Ledger is.'
        ];
        if (meta.credit.score >= 750) lines.push('Also the Guild Plus Card people called about you. Twice. I gave them your address. It seemed legal.');
        dialog.say(n.name, lines);
      }
    }

  } else if (n.name === 'Gift Shop Gnoll') {
    // one path for every SKU: cash or the account, by the book
    const buy = (price, ownedCheck, ownedText, apply, soldText) => ({
      cash: () => {
        if (ownedCheck()) dialog.setText(ownedText);
        else if (player.gold >= price) { player.gold -= price; apply(); fx.hudChanged(); dialog.setText(soldText); }
        else dialog.setText(price + ' gold. The register does not do wishes.');
        dialog.showHint();
      },
      credit: () => {
        if (ownedCheck()) dialog.setText(ownedText);
        else {
          const v = canBorrow(meta, price);
          if (!v.ok) dialog.setText(declineText(v.reason, meta));
          else {
            borrow(meta, price); apply(); fx.hudChanged();
            dialog.setText('Financed: ' + price + ' g at ' + pct(aprFor(meta.credit.score)) +
              ' APR (' + tierName(meta.credit.score) + '). Balance: ' + meta.credit.balance +
              ' g. Your debt is now officially crippling. This is a credential. Welcome to finance.');
          }
        }
        dialog.showHint();
      }
    });
    const skus = {
      glurp: buy(20, () => false, '',
        () => { player.potions++; fx.sfx('coin'); },
        'Ingredients: fluid, attitude, eels (fewer). Glurp will not fix you.*  (*Glurp will mostly fix you.)'),
      dirk: buy(60, () => player.swordLv >= 2,
        'You already have a DIRK! or better. Brand loyalty. The mascot salutes you. He has arms. Don\'t ask.',
        () => { player.swordLv = 2; fx.sfx('level'); },
        'DIRK! It\'s basically a sword! That\'s the whole slogan. Legal made us keep "basically."'),
      ultra: buy(400, () => player.swordLv >= 3,
        'You already swing ULTRA-class or better. The engineers send their regards. All nine of them.',
        () => { player.swordLv = 3; fx.sfx('level'); },
        'DIRK! ULTRA. Engineered composite. "Basically a better sword." The materials data sheet is laminated. Hespeth did that.')
    };

    const accountMenu = () => {
      const c = meta.credit;
      dialog.setSpeaker(n.name);
      dialog.setText('Account: balance ' + c.balance + ' g \u00B7 score ' + c.score + ' (' + tierName(c.score) +
        ', ' + pct(aprFor(c.score)) + ' APR) \u00B7 limit ' + creditLimit(meta) + ' g \u00B7 minimum due ' + minPayment(c) + ' g.');
      dialog.open();
      dialog.choice([
        { label: '\u{1F9EA} GLURP\u2122 on credit', fn: skus.glurp.credit },
        { label: '\u2694 DIRK!\u2122 on credit', fn: skus.dirk.credit },
        { label: '\u2694 ULTRA\u2122 on credit', fn: skus.ultra.credit },
        { label: '\u{1F4B0} Pay down debt', fn: () => {
          const paid = payDown(meta, player.gold);
          player.gold -= paid;
          fx.hudChanged();
          dialog.setText(paid > 0
            ? ('Paid ' + paid + ' g. Balance: ' + meta.credit.balance + ' g.' +
               (meta.credit.balance === 0 ? ' Cleared. The sticker comes off the file. Stampathy is misty.' : ''))
            : 'Nothing to pay with, or nothing to pay. Either way the register and I salute the attempt.');
          dialog.showHint();
        }},
        { label: '\u{1F4C4} Read the terms', fn: () => {
          dialog.say('TRUTH IN LENDING', truthInLending(meta), () => accountMenu());
        }},
        { label: 'Back', fn: () => mainMenu() }
      ]);
    };

    const mainMenu = () => {
      dialog.setSpeaker(n.name);
      dialog.setText('GLURP\u2122 20g ("Now With Fewer Eels!") \u00B7 DIRK!\u2122 60g ("It\'s basically a sword!") \u00B7 DIRK! ULTRA\u2122 400g ("Engineered.")');
      dialog.open();
      dialog.choice([
        { label: '\u{1F9EA} GLURP\u2122 \u00B7 20g', fn: skus.glurp.cash },
        { label: '\u2694 DIRK!\u2122 \u00B7 60g', fn: skus.dirk.cash },
        { label: '\u2694 ULTRA\u2122 \u00B7 400g', fn: skus.ultra.cash },
        { label: '\u{1F4B3} Credit & Account', fn: accountMenu },
        { label: 'Leave', fn: () => {
          dialog.setText('\u{1F3B5} If you\'re hurt or sad or cursed or dead-ish\u2014 \u{1F3B5} it loops. Walk fast.');
          dialog.showHint();
        }}
      ]);
    };

    const greeting = meta.credit.score >= 750
      ? ['\u{1F3B5} GLURP! It\'s adventure fluid! \u{1F3B5} \u2014 and WONDERFUL news! Your score pre-qualifies you for the GnollCard\u2122 Preferred at 9.99% APR. I am contractually thrilled. What do you need?']
      : ['\u{1F3B5} GLURP! It\'s adventure fluid! \u{1F3B5} \u2014 sorry. It loops. What do you need?'];
    dialog.say(n.name, greeting, mainMenu);

  } else if (n.name === 'GLURP-O-MATIC') {
    const HAZARD_PRICE = 35;   // topside it's 20. down here the hazard is ambient.
    const greeting = meta.credit.score >= 750
      ? ['THE GLURP-O-MATIC HUMS. The display scrolls: "WELCOME, PREFERRED ADVENTURER. PRE-QUALIFIED. 9.99% APR. THE MACHINE KNOWS YOUR NAME."']
      : ['THE GLURP-O-MATIC HUMS. GLURP™: ' + HAZARD_PRICE + ' g. HAZARD PRICING IN EFFECT. THE HAZARD IS AMBIENT. (See label.)'];
    dialog.say(n.name, greeting, () => {
      dialog.setSpeaker(n.name);
      dialog.setText('GLURP™ — ' + HAZARD_PRICE + ' g. "Now With Fewer Eels!" Topside it\'s 20. Topside is one flight of stairs away. The machine knows you won\'t.');
      dialog.open();
      dialog.choice([
        { label: '\u{1F9EA} Insert ' + HAZARD_PRICE + ' g', fn: () => {
          if (player.gold >= HAZARD_PRICE) {
            player.gold -= HAZARD_PRICE; player.potions++;
            fx.sfx('coin'); fx.hudChanged();
            dialog.setText('CLUNK. One Glurp. The machine plays 0.5 seconds of the jingle. It is enough.');
          } else dialog.setText('The display reads: "EXACT CHANGE ONLY." You do not have inexact change either.');
          dialog.showHint();
        }},
        { label: '\u{1F4B3} On credit', fn: () => {
          const v = canBorrow(meta, HAZARD_PRICE);
          if (!v.ok) dialog.setText('The display reads: "' + declineText(v.reason, meta) + '"');
          else {
            borrow(meta, HAZARD_PRICE); player.potions++;
            fx.sfx('coin'); fx.hudChanged();
            dialog.setText('CLUNK. Financed: ' + HAZARD_PRICE + ' g at ' + pct(aprFor(meta.credit.score)) + ' APR. Balance: ' +
              meta.credit.balance + ' g. The machine prints a receipt. The receipt is the long kind.');
          }
          dialog.showHint();
        }},
        { label: '\u{1F9B5} KICK IT', fn: () => {
          addMenace(meta, 'Kicked a vending machine. It was witnessed.');
          fx.sfx('push');
          dialog.setText('The machine absorbs the kick. Nothing drops. Nothing has ever dropped. The display flickers: "DECLINED." The incident has been documented. By the machine.');
          dialog.showHint();
        }},
        { label: 'Walk away', fn: () => {
          dialog.setText('\u{1F3B5} …if you\'re hurt or sad or cursed or dead-ish… \u{1F3B5} The machine hums it slower down here.');
          dialog.showHint();
        }}
      ]);
    });

  } else if (n.name === "Hespeth's Radio") {
    dialog.say(n.name, [
      'A radio, playing the light set. A label, stamped twice: PROPERTY OF CLERK HESPETH. THE DIAL IS SETTLED LAW.'
    ], () => {
      dialog.setSpeaker(n.name);
      dialog.setText('The dial has not moved in years. It is, in every sense that matters, notarized.');
      dialog.open();
      dialog.choice([
        { label: '✋ Touch the dial', fn: () => {
          addMenace(meta, "Touched Hespeth's radio dial. Stampathy saw.");
          fx.sfx('click');
          dialog.setText('You touch the dial. It does not move. Across the square, a stamp comes down on nothing in particular.');
          dialog.showHint();
        }},
        { label: 'Leave it', fn: () => {
          dialog.setText('The light set plays on. Somewhere in it, faintly, the sound of a kingdom getting through the week.');
          dialog.showHint();
        }}
      ]);
    });

  } else if (n.name === "Skritch's Radio") {
    dialog.say(n.name, [
      'A radio, mid-set. A sticky note: DO NOT TOUCH. The note is signed by the radio.'
    ], () => {
      dialog.setSpeaker(n.name);
      dialog.setText('The note has been re-stuck several times. The adhesive is tired. The conviction is not.');
      dialog.open();
      dialog.choice([
        { label: '✋ TOUCH IT', fn: () => {
          addMenace(meta, "Touched Skritch's radio. The note specifically said.");
          fx.sfx('click');
          dialog.setText('You touch it. Nothing happens. Everything has been recorded. Somewhere, an imp feels a disturbance in his set list.');
          dialog.showHint();
        }},
        { label: 'Respect the note', fn: () => {
          dialog.setText('You step back. The note relaxes visibly. The radio plays on, unbetrayed.');
          dialog.showHint();
        }}
      ]);
    });

  } else if (n.name === 'Hermit Gorse') {
    if (player.swordLv < 1) {
      dialog.say(n.name, [
        'You\'ve got the hands of someone who slaps geese. Don\'t. They keep score.',
        'Here. Take Pointy. Family blade. Forged— well. Grown. Found, technically. She\'s seen things.',
        'She\'ll return to me when her quest is done. They always do. That\'s how sticks work.'
      ], () => {
        player.swordLv = Math.max(player.swordLv, 1);
        fx.sfx('level'); fx.hudChanged();
        fx.toast('Acquired: Pointy (a pointy stick). She\'s seen things.');
      });
    } else {
      dialog.say(n.name, [
        'How\'s Pointy? Don\'t answer. I\'d know if something happened. The birch would tell me. The birch tells me everything.'
      ]);
    }

  } else if (n.name === 'Docent Brell') {
    if (meta.heist.skull) {
      // skull already obtained — she thinks the "correction" was her idea
      dialog.say(n.name, [
        'The skull has been transferred to a more historically accurate private collection. I processed the paperwork myself.',
        'The new plaques are better. They are CORRECT. And THAT\'S museum science.'
      ]);
      return;
    }
    // three-round plaque-logic puzzle: agree with her off-by-one "corrections" to trigger auto-deaccession
    const PLAQUE_FACTS = [
      { plaque: '"The dungeon was established 40 years ago."',
        brell: 'Forty-ONE years ago, actually. The plaque is WRONG. Someone will hear about this.' },
      { plaque: '"Malgrath wielded a sword called Grimtide."',
        brell: '"Thirstbringer." The plaque misspells it throughout. Classic plaque error. Classic.' },
      { plaque: '"Cause of death: a hero."',
        brell: 'A LEGENDARY hero, specifically. The plaque undersells. I have a correction on file.' }
    ];
    function skullRound(state) {
      if (state.done) {
        grantToken(meta, 'skull');
        fx.sfx('level');
        dialog.say(n.name, [
          'MUSEUM POLICY: exhibit acknowledged incorrect. AUTO-DEACCESSIONED.',
          'The skull is packaged for you at the gift shop. The bag says "THANK YOU FOR EVILING WITH US."'
        ]);
        return;
      }
      const fact = PLAQUE_FACTS[state.step] || PLAQUE_FACTS[0];
      dialog.setSpeaker(n.name);
      dialog.setText(fact.plaque + ' — wait. ' + fact.brell);
      dialog.open();
      dialog.choice([
        { label: 'You\'re absolutely right.', fn: () => { skullRound(skullAgree(state)); } },
        { label: 'The plaque seems fine to me.', fn: () => {
          skullCorrect(state);
          dialog.setText('The plaques are CORRECT. I wrote these. Every one. And THAT\'S museum science.');
          dialog.showHint();
        }}
      ]);
    }
    dialog.say(n.name, [
      'Welcome to the future site of the Royal Museum of Having Defeated Evil. Malgrath was slain forty-ONE years ago by a hero wielding the legendary sword Thirstbringer.',
      'And THAT\'S museum science.'
    ], () => {
      dialog.setSpeaker(n.name);
      dialog.setText('Actually, I\'ve been meaning to review the plaques. Someone with fresh eyes might help me catch the errors. The plaques have errors. The plaques are the problem.');
      dialog.open();
      dialog.choice([
        { label: '🏛 Review the plaques with her', fn: () => skullRound(makeSkullPuzzle()) },
        { label: '✋ Just take the skull', fn: () => {
          addMenace(meta, 'Removed a skull from a museum. It had a HEROIC CONTEXT.');
          grantToken(meta, 'skull');
          fx.sfx('coin');
          dialog.setText('You take the skull. A small card falls off: "SKULL (HEROIC CONTEXT)." You have stolen an educational resource. It is in your bag now.');
          dialog.showHint();
        }},
        { label: 'Not right now', fn: () => {
          dialog.setText('The plaques will be here. They are very permanent. And THAT\'S museum science.');
          dialog.showHint();
        }}
      ]);
    });

  } else if (n.name === 'Museum Exhibit Tag') {
    if (meta.menace.some(m => /DO NOT REMOVE/.test(m.deed))) {
      dialog.say(n.name, ['The tag is gone. The tag was very clear. So was the sign.']);
    } else {
      dialog.say(n.name, ['A small tag wired to the exhibit case. "DO NOT REMOVE." The wire is very thin.'], () => {
        dialog.setSpeaker(n.name);
        dialog.setText('The tag says DO NOT REMOVE. The tag has never been more readable than right now.');
        dialog.open();
        dialog.choice([
          { label: '✋ Remove it', fn: () => {
            addMenace(meta, 'Removed a tag that said DO NOT REMOVE. The tag was very clear.');
            fx.sfx('coin');
            dialog.setText('The tag comes off with a tiny, regrettable snap. It\'s in your pocket now. The case is still there. The tag is not.');
            dialog.showHint();
          }},
          { label: 'Leave it', fn: () => {
            dialog.setText('You step back. The tag remains. Some laws are observed.');
            dialog.showHint();
          }}
        ]);
      });
    }

  } else if (n.name === 'King Pfilbert') {
    dialog.say(n.name, [
      'Apocalypse? Sounds like a downstairs problem! We\'ll get \'em next year, champ.',
      'I\'ve been down there, you know. Floor one. Bought a magnet. Have you seen my magnet? It\'s on the throne. Everyone has seen the magnet.'
    ]);

  } else if (n.name === 'Safety Officer Dimwald') {
    dialog.say(n.name, [
      'This kingdom is a certified Safe Workplace. The banner is only a little on fire. Fire is a known feature of banners. Certified.',
      'The goose is exempt. Nobody certifies a goose.'
    ]);

  } else if (n.name === 'Royal Grass Sign') {
    if (meta.menace.some(m => /royal grass/.test(m.deed))) {
      dialog.say(n.name, ['The sign still says "DO NOT CROSS (ROYAL GRASS)." You have already crossed it. The sign has noted this.']);
    } else {
      dialog.say(n.name, ['A sign: "DO NOT CROSS (ROYAL GRASS). By Order of the Crown." The grass is, technically, quite nice.'], () => {
        dialog.setSpeaker(n.name);
        dialog.setText('The sign is very official. The grass is right there. These facts coexist.');
        dialog.open();
        dialog.choice([
          { label: '🌿 Cross the royal grass', fn: () => {
            addMenace(meta, 'Walked on the royal grass. It was, technically, grass. The sign was very clear about this.');
            fx.sfx('click');
            dialog.setText('You step onto the royal grass. It is, in fact, just grass. Extremely well-maintained grass. Extremely well-documented grass. It is in the menace résumé now.');
            dialog.showHint();
          }},
          { label: 'Obey the sign', fn: () => {
            dialog.setText('You step back. The sign seems satisfied. The grass remains royal.');
            dialog.showHint();
          }}
        ]);
      });
    }

  } else if (n.name === "Malgrath's Mother") {
    if (meta.heist.gregory) {
      // first pet already identified
      dialog.say(n.name, [
        'You remembered Gregory! Such a clever one. He was always a good rock.',
        'He\'s right over there, if you want to say hello. He would like that. Rocks don\'t show it, but he would.'
      ]);
    } else {
      dialog.say(n.name, [
        'My Malgrath. Such a focused child. The dungeon was his passion. He had a pet, you know. Very calm. Never ran away.',
        'The other monsters couldn\'t agree on what it was. But if you sat very still, you could hear it not doing anything at all.'
      ], () => {
        dialog.setSpeaker(n.name);
        dialog.setText('What do you think Malgrath\'s first pet was?');
        dialog.open();
        dialog.choice([
          { label: 'Gregory the rock', fn: () => {
            grantToken(meta, 'gregory');
            fx.sfx('level');
            dialog.setText('Oh! You know Gregory! Yes — Gregory. He is right over there. He\'s been right over there for forty years. Rocks don\'t die, dear. That\'s just how rocks are.');
            dialog.showHint();
          }},
          { label: 'A goose', fn: () => {
            dialog.setText('No, no. Geese are their OWN problem. Malgrath would never. Try again, dear.');
            dialog.showHint();
          }},
          { label: 'A skeleton', fn: () => {
            dialog.setText('The skeletons were employees, not pets. Malgrath was very clear about HR boundaries. Try again.');
            dialog.showHint();
          }},
          { label: 'A slime', fn: () => {
            dialog.setText('The slime is an intern. It\'s very different. The paperwork alone— no. Try again, dear.');
            dialog.showHint();
          }}
        ]);
      });
    }

  } else if (n.name === 'Gregory') {
    if (meta.heist.gregory) {
      dialog.say(n.name, ['Gregory sits here. He is extremely calm about everything. He has always been extremely calm about everything. This, you have learned, is just how Gregory is.']);
    } else {
      dialog.say(n.name, ['A rock. Very still. Very grey. There is something about it that suggests it has been here a long time and does not mind this at all.']);
    }

  } else if (n.name === "Malgrath's Gauntlet") {
    const result = trySignature(meta);
    if (result === 'have') {
      dialog.say(n.name, [
        'The gauntlet rests where you left it. The signature is secured. Appropriate menace: confirmed.',
        'It waves, once, diplomatically.'
      ]);
    } else if (result === 'insufficient') {
      const need = MENACE_THRESHOLD - meta.menace.length;
      dialog.say(n.name, [
        'The gauntlet lies still. It has reviewed your menace résumé.',
        'MENACE INSUFFICIENT. ' + meta.menace.length + ' documented offenses. Requires ' + MENACE_THRESHOLD + '. ('  + need + ' more needed.) The signature demands appropriate gravitas. You do not yet have it.'
      ]);
    } else {
      // 'granted' — signature obtained
      fx.sfx('level');
      dialog.say(n.name, [
        'The gauntlet stirs. It has reviewed the résumé. It is satisfied.',
        'MENACE: APPROPRIATE. It signs. Wherever it signs. It is a gauntlet. The signature is yours. Try not to use it for anything weird.'
      ]);
    }

  } else if (n.name === 'Cancellation Desk') {
    if (!game.puzzle || !game.puzzle.bossDead) {
      // boss still standing
      dialog.say(n.name, [
        'THE CANCELLATION DESK. A small sign: "BACK IN 40 YEARS." The ink is not dry.',
        'The Origenal Hero is still here. He has opinions about that.'
      ]);
    } else {
      const st = deskStatus(meta);
      if (!st.ready) {
        dialog.say(n.name, [
          'THE FORM REQUIRES:',
          st.missing.join('; ') + '.',
          'The desk cannot process an incomplete cancellation. See reverse. (There is no reverse.)'
        ]);
      } else {
        dialog.say(n.name, [
          'THE FORM IS COMPLETE. All three items present and verified.',
          'CANCELLATION DESK: "Final question. Do you want the apocalypse to STOP — or do you want it to be YOURS?"'
        ], () => {
          dialog.setSpeaker(n.name);
          dialog.setText('Sign here. Or here. There is no wrong answer. There is, however, a permanent one.');
          dialog.open();
          dialog.choice([
            { label: '✦ Cancel everything', fn: () => {
              applyCancel(game);
              fx.sfx('win');
              fx.onEpilogue();
            }},
            { label: '▣ Transfer ownership (become the account holder)', fn: () => {
              applyTransfer(game);
              fx.sfx('level');
              fx.onTransfer();
            }}
          ]);
        });
      }
    }

  } else { // Picketing Hero
    const lines = quest.stage >= 3
      ? ['WHAT DO WE WANT! A REASONABLE DEDUCTIBLE! Anyway \u2014 the Reenactor announces his charge. It\'s theater. Step aside on "FAMOUS," strike on "CHARGE." We\'d do it ourselves but, you know. Strike.',
         'Nice gear, by the way. (We\'re heckling a child\'s job. We know. We\'re a little proud.)']
      : ['WHEN DO WE WANT IT! FOLLOWING STANDARD PROCESSING TIMES!',
         'You\'re the new hire? They gave the apocalypse ticket to\u2014 okay. Okay! Tip: the pigeons won\'t start it. The geese need no reason. Solidarity.'];
    dialog.say(n.name, lines);
  }
}
