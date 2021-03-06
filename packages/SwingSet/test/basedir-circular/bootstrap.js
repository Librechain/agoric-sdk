/* global harden */
import { E } from '@agoric/eventual-send';

export function buildRootObject(_vatPowers) {
  return harden({
    bootstrap(vats) {
      const pa = E(vats.bob).genPromise1();
      const pb = E(vats.bob).genPromise2();
      E(vats.bob).usePromises([pa], [pb]);
    },
  });
}
