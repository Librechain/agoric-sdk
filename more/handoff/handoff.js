// Copyright (C) 2019 Agoric, under Apache License 2.0

import harden from '@agoric/harden';

import { makeCorkboard } from './corkboard';
import { insist } from '../../util/insist';

function makeHandoffService() {
  // I'd have used PrivateNames, but they want objects (not Strings) as Keys.
  const boards = new Map();
  const brand = new WeakSet();

  const handoffService = harden({
    // retrieve and remove from the map.
    grab(key) {
      if (!boards.has(key)) {
        return undefined;
      }
      const result = boards.get(key);
      // these are single-use entries.
      boards.delete(key);
      return result;
    },
    createEntry(preferredName) {
      if (boards.has(preferredName)) {
        throw new Error(`Entry already exists: ${preferredName}`);
      }
      const corkBoard = makeCorkboard(preferredName);
      boards.set(preferredName, corkBoard);
      brand.add(corkBoard);
      return corkBoard;
    },
    validate(allegedBoard) {
      insist(brand.has(allegedBoard))`\
Unrecognized board: ${allegedBoard}`;
      return allegedBoard;
    },
    // We don't need remove, since grab can be used for that.
  });

  return handoffService;
}

export { makeHandoffService };