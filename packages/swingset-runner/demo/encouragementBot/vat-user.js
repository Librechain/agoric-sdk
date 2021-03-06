/* global harden */

import { E } from '@agoric/eventual-send';

const log = console.log;

export function buildRootObject(_vatPowers) {
  return harden({
    talkToBot(bot, botName) {
      log(`=> user.talkToBot is called with ${botName}`);
      E(bot)
        .encourageMe('user')
        .then(myEncouragement =>
          log(`=> user receives the encouragement: ${myEncouragement}`),
        );
      return 'Thanks for the setup. I sure hope I get some encouragement...\nuser vat is happy\n';
    },
  });
}
