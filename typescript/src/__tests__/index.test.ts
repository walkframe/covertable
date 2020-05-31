import {default as make, sorters, criteria} from '../index'
import {product, combinations, range, len, all, getItems} from '../utils'
import {FactorsType, Scalar, Dict} from '../types'

const getPairs = function* (factors: FactorsType, length=2) {
  const allKeys = getItems(factors).map(([k, _]) => k)
  for (let keys of combinations(allKeys, length)) {
    const factorsList = range(0, length).map(i => factors[keys[i]])
    for (let pair of product(... factorsList)) {
      yield pair
    }
  }
}

test('2pair', () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e"],
    ["f"],
    ["g", "h"],
    ["i", "j"],
    ["k", "l", "m", "n"],
  ]
  const length = 2
  const rows = make(factors, {length, criterion: criteria.simple})
  for (let pair of getPairs(factors, length)) {
    let final = true
    for (let row of rows) {
      if (all(pair.map(p => row.indexOf(p) !== -1))) {
        final = false
        break
      }
    }
    if (final) {
      throw `${pair} is not in any rows`
    }
  }
});

test('3pair', () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e"],
    ["f"],
    ["g", "h"],
    ["i", "j"],
    ["k", "l", "m", "n"],
  ]
  const length = 3
  const rows = make(factors, {length})
  for (let pair of getPairs(factors, length)) {
    let final = true
    for (let row of rows) {
      if (all(pair.map(p => row.indexOf(p) !== -1))) {
        final = false
        break
      }
    }
    if (final) {
      throw `${pair} is not in any rows`
    }
  }
});

test('prefilter excludes specified pairs before', () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e"],
    ["f"],
  ]
  const preFilter = (row: Dict) => {
    if (row[0] === "a" && row[1] === "d") {
      return false
    }
    if (row[0] === "b" && row[1] === "e") {
      return false
    }
    return true
  }
  const rows = make(factors, {preFilter})
  const unexpectedPairs = [["a", "d"], ["b", "e"]]
  for (let pair of unexpectedPairs) {
    for (let row of rows) {
      if (all(pair.map(p => row.indexOf(p) !== -1))) {
        throw `${pair} is in a row: ${row}`
      }
    }
  }
});

test('prefilter never matching throwing an exception', () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e"],
    ["f"],
  ]
  const preFilter = (row: Dict) => {
    if (row[2] === "f") {
      return false
    }
    return true
  }
  expect(() => {
    make(factors, {preFilter})
  }).toThrow();
});

test("greedy sorter should make rows less than seed's one with 2", () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e", "f"],
    ["g", "h", "i"],
    ["j", "k", "l"],
    ["m", "n", "o"],
  ]
  let len1 = 0, len2 = 0
  const length = 2
  for (let i of range(0, 10)) {
    const rows1 = make(factors, {length, seed: Math.random(), sorter: sorters.hash, criterion: criteria.greedy})
    const rows2 = make(factors, {length, seed: Math.random(), sorter: sorters.hash, criterion: criteria.simple})
    len1 += len(rows1)
    len2 += len(rows2)
  }
  expect(len1).toBeLessThan(len2)
})

test("greedy sorter should make rows less than seed's one with 3", () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e", "f"],
    ["g", "h", "i"],
    ["j", "k", "l"],
    ["m", "n", "o"],
  ]
  let len1 = 0, len2 = 0
  const length = 3
  for (let i of range(0, 10)) {
    const rows1 = make(factors, {length, seed: Math.random(), sorter: sorters.hash, criterion: criteria.greedy})
    const rows2 = make(factors, {length, seed: Math.random(), sorter: sorters.hash, criterion: criteria.simple})
    len1 += len(rows1)
    len2 += len(rows2)
  }
  expect(len1).toBeLessThan(len2)
})

test('random sorter makes different rows everytime', () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e", "f"],
    ["g", "h", "i"],
    ["j", "k", "l"],
    ["m", "n", "o"],
  ]
  for (let _ of range(0, 10)) {
    const rows1 = make(factors, {sorter: sorters.random})
    const rows2 = make(factors, {sorter: sorters.random})
    expect(JSON.stringify(rows1) === JSON.stringify(rows2)).toBe(false)
  }
})

test('dict type factors make dict row', () => {
  const factors = {
    'key1': ["a", "b", "c"],
    'key2': ["d", "e", "f"],
    'key3': ["g", "h", "i"],
    'key4': ["j", "k", "l"],
    'key5': ["m", "n", "o"],
  }
  const rows = make(factors)
  const sorter = (a: Scalar, b: Scalar) => a > b ? 1 : -1
  for (let row of rows) {
    const keys1 = Object.keys(row).sort(sorter)
    const keys2 = Object.keys(factors).sort(sorter)
    expect(keys1.toString()).toBe(keys2.toString())
  }
})
