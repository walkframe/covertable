import hashlib
from collections import defaultdict
from itertools import combinations


def get_num_removable_pairs(indexes, incomplete, length):
    removing_keys = combinations(indexes, length)
    return len(incomplete.intersection(removing_keys))


def extract(
    sorted_incomplete, row, parents, length, incomplete, tolerance=0, **kwargs
):
    while True:
        max_num_pairs = None
        efficient_pair = None

        for pair in sorted_incomplete:
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
                sorted({*row.values(), *pair}), incomplete, length
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
