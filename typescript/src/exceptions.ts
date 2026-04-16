import { ScalarType } from "./types";

export class NotReady extends Error {
  constructor(public key: ScalarType) {
    super(`Not yet '${key}' in the object`);
  }
}

export interface UncoveredPair {
  /** The pair expressed as factor-key → value entries. */
  pair: Record<string, any>;
  /** The constraint(s) that made this pair infeasible, if identifiable. */
  constraints: number[];
}

export class NeverMatch extends Error {
  public uncoveredPairs: UncoveredPair[];

  constructor(message?: string, uncoveredPairs: UncoveredPair[] = []) {
    super(message);
    this.uncoveredPairs = uncoveredPairs;
  }
};
