"""Greedy sorter
"""

import hashlib
import random
from collections import defaultdict
from itertools import product, combinations, permutations


def get_num_remaining(indexes, incompleted, length):
    copied = incompleted.copy()

    for vs in combinations(indexes, length):
        copied.discard(tuple(sorted(vs)))

    return len(copied)


def sort(incompleted, row, parents, length, seed="", *args, **kwargs):
    def comparer(v):
        pair = ",".join(map(str, v))
        return hashlib.md5("{} {}".format(pair, seed).encode("utf-8")).hexdigest()

    while True:
        min_remaining = None
        efficient_pair = None
        for pair in sorted(incompleted, key=comparer):
            keys = [parents[p] for p in pair]
            candidate = list(zip(keys, pair))
            if not row.storable(candidate):
                continue

            remaining = get_num_remaining([*row.values(), *pair], incompleted, length)
            if min_remaining is None or remaining < min_remaining:
                min_remaining = remaining
                efficient_pair = pair
        if not efficient_pair:
            break

        yield efficient_pair
