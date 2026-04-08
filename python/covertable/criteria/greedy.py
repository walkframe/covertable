from itertools import combinations
from ..lib import unique


def get_num_removable_pairs(indexes, incomplete, length):
    num = 0
    for pair in combinations(sorted(indexes), length):
        key = unique(pair)
        if key in incomplete:
            num += 1
    return num


def extract(ctrl):
    while True:
        max_num_pairs = None
        efficient_pair = None

        for pair_key, pair in list(ctrl.incomplete.items()):
            row_size = len(ctrl.row)
            if row_size == 0:
                yield pair
                continue

            if ctrl.is_filled():
                break

            storable = ctrl.storable(ctrl.get_candidate(pair))
            if storable is None:
                continue

            if storable == 0:
                ctrl.consume(pair)
                continue

            storable_abs = abs(storable)
            num_pairs = get_num_removable_pairs(
                set(list(ctrl.row.values()) + list(pair)),
                ctrl.incomplete,
                ctrl.length,
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
