

const comparer = (a: any, b: any) => {
  return Math.random() > 0.5 ? 1 : -1
}

export default function* (
  incompleted: Map<string, number[]>,
  sortArgs: any
) {
  for (let [_, pair] of [... incompleted.entries()].sort(comparer)) {
    yield pair
  }
}
