from itertools import combinations


def get_num_removable_pairs(indexes, incomplete, strengths, exclude=None):
    num = 0
    arr = sorted(indexes)
    for s in strengths:
        if s == 2:
            # Fast path for pairwise: avoid combinations overhead
            length = len(arr)
            for i in range(length - 1):
                ai = arr[i]
                for j in range(i + 1, length):
                    key = (ai, arr[j])
                    if key in incomplete and (exclude is None or key not in exclude):
                        num += 1
        else:
            for pair in combinations(arr, s):
                if pair in incomplete and (exclude is None or pair not in exclude):
                    num += 1
    return num


def extract(ctrl):
    has_constraints = bool(ctrl._constraints)
    while True:
        max_num_pairs = None
        efficient_pair = None

        # Compute pairs already covered by current row
        row_covered = set()
        if ctrl.row:
            for s in ctrl.all_strengths:
                for p in combinations(sorted(ctrl.row.values()), s):
                    row_covered.add(tuple(p))

        for pair_key, pair in list(ctrl.incomplete.items()):
            row_size = len(ctrl.row)

            if ctrl.is_filled():
                break

            # Skip pairs already covered by current row
            if pair_key in row_covered:
                continue

            # Skip pairs that failed for this row
            if pair_key in ctrl.row.invalid_pairs:
                continue

            # Fast compatibility check
            compat = len(pair) if row_size == 0 else ctrl.is_compatible(pair)
            if compat is None:
                continue
            if compat == 0:
                continue

            # Full storable check if constraints exist
            storable = compat
            if has_constraints:
                full_storable = ctrl.storable(ctrl.get_candidate(pair))
                if full_storable is None:
                    continue
                if full_storable == 0:
                    continue
                storable = full_storable

            storable_abs = abs(storable)

            num_pairs = get_num_removable_pairs(
                set(list(ctrl.row.values()) + list(pair)),
                ctrl.incomplete,
                ctrl.all_strengths,
                row_covered,
            )

            if num_pairs + ctrl.tolerance > row_size * storable_abs:
                efficient_pair = pair
                break
            if max_num_pairs is None or max_num_pairs < num_pairs:
                max_num_pairs = num_pairs
                efficient_pair = pair

        if efficient_pair is None:
            break
        yield efficient_pair
