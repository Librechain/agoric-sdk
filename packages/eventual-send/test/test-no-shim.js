import '@agoric/install-ses';
import test from 'tape-promise/tape';

import { hpControl } from './install-fake-hp';
import { E } from '..';

test('E reexports', async t => {
  try {
    const res = await E(123).toString();
    t.equals(res, '123', 'E works with no shim');
    t.deepEquals(
      hpControl.getLogs(),
      [['applyMethod', 123, 'toString', []]],
      'got correct logs',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
