/* global globalThis */
const logs = [];

// eslint-disable-next-line import/prefer-default-export
export const hpControl = {
  getLogs() {
    return logs;
  },
};

const fake = {
  applyMethod(p, prop, args) {
    logs.push(['applyMethod', p, prop, args]);
    return Promise.resolve().then(_ => p[prop](...args));
  },
};

globalThis.HandledPromise = fake;
