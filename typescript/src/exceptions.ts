import { ScalarType } from "./types";

export class NotReady extends Error {
  constructor(public key: ScalarType) {
    super(`Not yet '${key}' in the object`);
  }
}

export class NeverMatch extends Error {
};
