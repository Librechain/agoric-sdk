/* global harden */
import { assert } from '@agoric/assert';
import { assertKnownOptions } from '../assertOptions';
import { makeVatSlot } from '../parseVatSlots';

export function makeVatRootObjectSlot() {
  return makeVatSlot('object', true, 0);
}

export function makeDynamicVatCreator(stuff) {
  const {
    allocateUnusedVatID,
    vatNameToID,
    vatManagerFactory,
    addVatManager,
    addExport,
    queueToExport,
    getBundle,
    kernelKeeper,
    panic,
  } = stuff;

  /** A function to be called from the vatAdmin device to create a new vat. It
   * creates the vat and sends a notification to the device. The root object
   * will be available soon, but we immediately return the vatID so the ultimate
   * requestor doesn't have to wait.
   *
   * @param source an object which either has a `bundle` (JSON-serializable
   * data) or a `bundleName` string. The bundle defines the vat, and should
   * be generated by calling bundle-source on a module with an export named
   * makeRootObject(). If `bundleName` is used, it must identify a bundle
   * already known to the kernel (via the `config.bundles` table).
   * @param options a "dynamicOptions" bundle. This recognizes two options so
   * far. The first is 'metered' (defaults to 'true') which subjects the new
   * dynamic vat to a meter that limits the amount of computation and
   * allocation that can occur during any given crank. Stack frames are
   * limited as well. The meter is refilled between cranks, but if the meter
   * ever underflows, the vat is terminated. If 'false', the vat is
   * unmetered. The other is 'vatParameters', which provides the contents of
   * the second argument to 'buildRootObject()'
   *
   * @return { vatID } the vatID for a newly created vat. The success or
   * failure of the operation will be reported in a message to the admin vat,
   * citing this vatID
   */

  function createVatDynamically(source, dynamicOptions = {}) {
    const vatID = allocateUnusedVatID();
    kernelKeeper.addDynamicVatID(vatID);
    const vatKeeper = kernelKeeper.allocateVatKeeperIfNeeded(vatID);
    vatKeeper.setSourceAndOptions(source, dynamicOptions);
    // eslint-disable-next-line no-use-before-define
    return create(vatID, source, dynamicOptions, true);
  }

  function recreateVatDynamically(vatID, source, dynamicOptions) {
    // eslint-disable-next-line no-use-before-define
    return create(vatID, source, dynamicOptions, false);
  }

  function create(vatID, source, dynamicOptions, notifyNewVat) {
    assert(source.bundle || source.bundleName, 'broken source');
    const vatSourceBundle = source.bundle || getBundle(source.bundleName);
    if (!vatSourceBundle) {
      throw Error(`Bundle ${source.bundleName} not found`);
    }
    assertKnownOptions(dynamicOptions, ['metered', 'vatParameters']);
    const { metered = true, vatParameters = {} } = dynamicOptions;
    let terminated = false;

    function notifyTermination(error) {
      if (terminated) {
        return;
      }
      terminated = true;
      const vatAdminVatId = vatNameToID('vatAdmin');
      const vatAdminRootObjectSlot = makeVatRootObjectSlot();

      const args = {
        body: JSON.stringify([
          vatID,
          error
            ? { '@qclass': 'error', name: error.name, message: error.message }
            : { '@qclass': 'undefined' },
        ]),
        slots: [],
      };

      queueToExport(
        vatAdminVatId,
        vatAdminRootObjectSlot,
        'vatTerminated',
        args,
        'logFailure',
      );
    }

    async function build() {
      if (typeof vatSourceBundle !== 'object') {
        throw Error(
          `createVatDynamically() requires bundle, not a plain string`,
        );
      }

      const managerOptions = {
        bundle: vatSourceBundle,
        metered,
        enableSetup: false,
        enableInternalMetering: false,
        notifyTermination: metered ? notifyTermination : undefined,
        vatParameters,
      };
      const manager = await vatManagerFactory(vatID, managerOptions);
      addVatManager(vatID, manager, managerOptions);
    }

    function makeSuccessResponse() {
      // build success message, giving admin vat access to the new vat's root
      // object
      const kernelRootObjSlot = addExport(vatID, makeVatRootObjectSlot());

      return {
        body: JSON.stringify([
          vatID,
          { rootObject: { '@qclass': 'slot', index: 0 } },
        ]),
        slots: [kernelRootObjSlot],
      };
    }

    function makeErrorResponse(error) {
      return {
        body: JSON.stringify([vatID, { error: `${error}` }]),
        slots: [],
      };
    }

    function errorDuringReplay(error) {
      // if we fail to recreate the vat during replay, crash the kernel,
      // because we no longer have any way to inform the original caller
      panic(`unable to re-create dynamic vat ${vatID}`, error);
    }

    function sendResponse(args) {
      const vatAdminVatId = vatNameToID('vatAdmin');
      const vatAdminRootObjectSlot = makeVatRootObjectSlot();
      queueToExport(
        vatAdminVatId,
        vatAdminRootObjectSlot,
        'newVatCallback',
        args,
        'logFailure',
      );
    }

    // vatManagerFactory is async, so we prepare a callback chain to execute
    // the resulting setup function, create the new vat around the resulting
    // dispatch object, and notify the admin vat of our success (or failure).
    // We presume that importBundle's Promise will fire promptly (before
    // setImmediate does, i.e. importBundle is async but doesn't do any IO,
    // so it doesn't really need to be async), because otherwise the
    // queueToExport might fire (and insert messages into the kernel run
    // queue) in the middle of some other vat's crank. TODO: find a safer
    // way, maybe the response should go out to the controller's "queue
    // things single file into the kernel" queue, once such a thing exists.
    const p = Promise.resolve().then(build);
    if (notifyNewVat) {
      p.then(makeSuccessResponse, makeErrorResponse)
        .then(sendResponse)
        .catch(err => console.error(`error in createVatDynamically`, err));
    } else {
      p.catch(errorDuringReplay);
    }

    // we return the vatID right away, so the the admin vat can prepare for
    // the notification
    return vatID;
  }

  return harden({ createVatDynamically, recreateVatDynamically });
}
