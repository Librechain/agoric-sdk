/**
 * Modify a Promise class to have it support eventual send (infix-bang) operations.
 *
 * Based heavily on nanoq https://github.com/drses/nanoq/blob/master/src/nanoq.js
 *
 * Original spec for the infix-bang desugaring:
 * https://web.archive.org/web/20161026162206/http://wiki.ecmascript.org/doku.php?id=strawman:concurrency
 *
 * @param {typeof Promise} Promise ES6 Promise class to shim
 * @return {typeof EPromise} Extended promise
 */
export default function maybeExtendPromise(Promise) {
  // Make idempotent, so we don't layer on top of a BasePromise that is adequate.
  if (typeof Promise.makeHandled === 'function') {
    return Promise;
  }

  const presenceToHandler = new WeakMap();
  const presenceToPromise = new WeakMap();
  const promiseToHandler = new WeakMap();

  // This special handler accepts Promises, and forwards
  // handled Promises to their corresponding fulfilledHandler.
  let forwardingHandler;
  function handler(p) {
    return promiseToHandler.get(p) || forwardingHandler;
  }

  Object.defineProperties(
    Promise.prototype,
    Object.getOwnPropertyDescriptors({
      get(key) {
        return handler(this).GET(this, key);
      },

      put(key, val) {
        return handler(this).PUT(this, key, val);
      },

      delete(key) {
        return handler(this).DELETE(this, key);
      },

      post(optKey, args) {
        return handler(this).POST(this, optKey, args);
      },

      invoke(optKey, ...args) {
        return handler(this).POST(this, optKey, args);
      },

      fapply(args) {
        return handler(this).POST(this, undefined, args);
      },

      fcall(...args) {
        return handler(this).POST(this, undefined, args);
      },
    }),
  );

  const baseResolve = Promise.resolve.bind(Promise);

  // Add Promise.makeHandled and update Promise.resolve.
  Object.defineProperties(
    Promise,
    Object.getOwnPropertyDescriptors({
      resolve(value) {
        // Resolving a Presence returns the pre-registered handled promise.
        const handledPromise = presenceToPromise.get(value);
        if (handledPromise) {
          return handledPromise;
        }
        return baseResolve(value);
      },

      makeHandled(executor, unfulfilledHandler = undefined) {
        let handledResolve;
        let handledReject;
        let continueForwarding;
        const handledP = new Promise((resolve, reject) => {
          handledResolve = resolve;
          handledReject = reject;
        });

        if (!unfulfilledHandler) {
          // Create a simple unfulfilledHandler that just postpones until the
          // fulfilledHandler is set.
          //
          // This is insufficient for actual remote handled Promises
          // (too many round-trips), but is an easy way to create a local handled Promise.
          const handlerP = new Promise(resolve => {
            continueForwarding = () => resolve(null);
          });

          const postpone = forwardedOperation => {
            // Just wait until the handler is resolved/rejected.
            return async (p, ...args) => {
              // console.log(`forwarding ${forwardedOperation}`);
              await handlerP;
              return p[forwardedOperation](...args);
            };
          };

          unfulfilledHandler = {
            GET: postpone('get'),
            PUT: postpone('put'),
            DELETE: postpone('delete'),
            POST: postpone('post'),
          };
        }

        function validateHandler(h) {
          if (Object(h) !== h) {
            throw TypeError(`Handler ${h} cannot be a primitive`);
          }
          for (const method of ['GET', 'PUT', 'DELETE', 'POST']) {
            if (typeof h[method] !== 'function') {
              throw TypeError(`Handler ${h} requires a ${method} method`);
            }
          }
        }
        validateHandler(unfulfilledHandler);

        // Until the handled promise is resolved, we use the unfulfilledHandler.
        promiseToHandler.set(handledP, unfulfilledHandler);

        function rejectHandled(reason) {
          if (continueForwarding) {
            continueForwarding();
          }
          handledReject(reason);
        }

        async function resolveHandled(target, fulfilledHandler) {
          try {
            // Sanity checks.
            if (fulfilledHandler) {
              validateHandler(fulfilledHandler);
            }

            if (!fulfilledHandler) {
              // Resolve with the target.
              handledResolve(target);

              const existingUnfulfilledHandler = promiseToHandler.get(target);
              if (existingUnfulfilledHandler) {
                // Reuse the unfulfilled handler.
                promiseToHandler.set(handledP, existingUnfulfilledHandler);
                return;
              }

              // See if the target is a presence we already know of.
              const presence = await target;
              const existingFulfilledHandler = presenceToHandler.get(presence);
              if (existingFulfilledHandler) {
                promiseToHandler.set(handledP, existingFulfilledHandler);
                return;
              }

              // Remove the mapping, as we don't need a handler.
              promiseToHandler.delete(handledP);
              return;
            }

            // Validate and install our mapped target (i.e. presence).
            const presence = target;
            if (Object(presence) !== presence) {
              throw TypeError(`Presence ${presence} cannot be a primitive`);
            }
            if (presence === null) {
              throw TypeError(`Presence ${presence} cannot be null`);
            }
            if (presenceToHandler.has(presence)) {
              throw TypeError(`Presence ${presence} is already mapped`);
            }
            if (presence && typeof presence.then === 'function') {
              throw TypeError(
                `Presence ${presence} cannot be a Promise or other thenable`,
              );
            }

            // Create table entries for the presence mapped to the fulfilledHandler.
            presenceToPromise.set(presence, handledP);
            presenceToHandler.set(presence, fulfilledHandler);

            // Remove the mapping, as our fulfilledHandler should be used instead.
            promiseToHandler.delete(handledP);

            // We committed to this presence, so resolve.
            handledResolve(presence);

            // Tell the default unfulfilledHandler to forward messages.
            if (continueForwarding) {
              continueForwarding();
            }
          } catch (e) {
            rejectHandled(e);
          }
        }

        // Invoke the callback to let the user resolve/reject.
        executor(resolveHandled, rejectHandled);

        // Return a handled Promise, which wil be resolved/rejected
        // by the executor.
        return handledP;
      },
    }),
  );

  function makeForwarder(operation, localImpl) {
    return async (ep, ...args) => {
      const o = await ep;
      const fulfilledHandler = presenceToHandler.get(o);
      if (fulfilledHandler) {
        // The handler was resolved, so give it a naked object.
        return fulfilledHandler[operation](o, ...args);
      }

      // Not a handled Promise, so use the local implementation on the
      // naked object.
      return localImpl(o, ...args);
    };
  }

  forwardingHandler = {
    GET: makeForwarder('GET', (o, key) => o[key]),
    PUT: makeForwarder('PUT', (o, key, val) => (o[key] = val)),
    DELETE: makeForwarder('DELETE', (o, key) => delete o[key]),
    POST: makeForwarder('POST', (o, optKey, args) => {
      if (optKey === undefined || optKey === null) {
        return o(...args);
      }
      return o[optKey](...args);
    }),
  };
  return Promise;
}
