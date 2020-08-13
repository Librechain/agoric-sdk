/* global globalThis HandledPromise */

import makeHandledPromise from './src/handled-promise';
import makeE from './src/E';

let hp;
if (typeof HandledPromise === 'undefined') {
  hp = makeHandledPromise(Promise);
  globalThis.HandledPromise = hp;
} else {
  hp = HandledPromise;
}

// Don't make a mutable binding.
const hpConst = hp;
export { hpConst as HandledPromise };

export const E = makeE(HandledPromise);
