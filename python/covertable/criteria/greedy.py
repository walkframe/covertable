import hashlib
from collections import defaultdict
from itertools import combinations


def get_num_removable_pairs(indexes, incompleted, length):
    removing_keys = combinations(indexes, length)
    return len(incompleted.intersection(removing_keys))


def extract(
    sorted_incompleted, row, parents, length, incompleted, tolerance=0, **kwargs
):
    while True:
        max_num_pairs = None
        efficient_pair = None

        for pair in sorted_incompleted:
            if not row:
                yield pair
                continue

            if row.filled():
                break

            storable = row.storable([(parents[p], p) for p in pair])
            if storable is None:
                continue

            if storable == 0:
                continue

            num_pairs = get_num_removable_pairs(
                sorted({*row.values(), *pair}), incompleted, length
            )
            if num_pairs + tolerance > len(row) * storable:
                efficient_pair = pair
                break
            if max_num_pairs is None or max_num_pairs < num_pairs:
                max_num_pairs = num_pairs
                efficient_pair = pair

        if not efficient_pair:
            break

        yield efficient_pair
