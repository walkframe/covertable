
export default function (
  incompleted: Map<string, number[]>,
  sortArgs: any
) {
  return [... incompleted.values()];
}
