"""Greedy sorter
"""

import hashlib
import random
from collections import defaultdict
from itertools import product, combinations, permutations


def get_num_removable_pairs(indexes, incompleted, length):
    removing_keys = {tuple(sorted(vs)) for vs in combinations(indexes, length)}
    return len(removing_keys & incompleted)


def sort(incompleted, row, parents, length, seed="", *args, **kwargs):
    def comparer(v):
        cdef str pair = ",".join(map(str, v))
        return hashlib.md5("{} {}".format(pair, seed).encode("utf-8")).hexdigest()

    cdef:
        int max_num_pairs
        tuple efficient_pair
        list candidate
        int num_pairs

    while True:
        max_num_pairs = -1
        efficient_pair = ()
        for pair in sorted(incompleted, key=comparer):
            if not row:
                efficient_pair = pair
                break
            candidate = [(parents[p], p) for p in pair]
            if not row.storable(candidate):
                continue

            num_pairs = get_num_removable_pairs(
                [*row.values(), *pair], incompleted, length
            )
            if max_num_pairs == -1 or max_num_pairs < num_pairs:
                max_num_pairs = num_pairs
                efficient_pair = pair
        if not efficient_pair:
            break

        yield efficient_pair
