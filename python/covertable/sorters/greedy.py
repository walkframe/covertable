"""Greedy sorter
"""

import hashlib
import random
from collections import defaultdict
from itertools import product, combinations, permutations


def get_num_removable_pairs(indexes, incompleted, length):
    removing_keys = {
        tuple(sorted(vs))
        for vs in combinations(indexes, length)
    }
    return len(removing_keys & incompleted)


def sort(incompleted, row, parents, length, seed="", *args, **kwargs):
    def comparer(v):
        pair = ",".join(map(str, v))
        return hashlib.md5("{} {}".format(pair, seed).encode("utf-8")).hexdigest()

    while True:
        max_num_pairs = None
        efficient_pair = None
        for pair in sorted(incompleted, key=comparer):
            if not row:
                efficient_pair = pair
                break
            candidate = [(parents[p], p) for p in pair]
            if not row.storable(candidate):
                continue

            num_pairs = get_num_removable_pairs([*row.values(), *pair], incompleted, length)
            if max_num_pairs is None or max_num_pairs < num_pairs:
                max_num_pairs = num_pairs
                efficient_pair = pair
        if not efficient_pair:
            break

        yield efficient_pair
