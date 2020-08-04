/* global harden */

import { E } from '@agoric/eventual-send';

const log = console.log;

log(`=> loading bootstrap.js`);

export function buildRootObject(_vatPowers) {
  log(`=> setup called`);
  let alice;
  let bob;
  return harden({
    bootstrap(vats) {
      alice = vats.alice;
      bob = vats.bob;
      log('=> bootstrap() called');
      E(alice).setNickname('alice');
      E(bob).setNickname('bob');
      E(alice)
        .introduceYourselfTo(bob)
        .then(
          r => log(`=> alice.introduceYourselfTo(bob) resolved to '${r}'`),
          e => log(`=> alice.introduceYourselfTo(bob) rejected as '${e}'`),
        );
    },
    runBenchmarkRound() {
      E(alice).doPing('hey!');
    },
  });
}
