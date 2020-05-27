"""Soft greedy sorter
"""

import hashlib
from collections import defaultdict
from itertools import combinations


def extract(sorted_incompleted, row, parents, incompleted, **kwargs):
    while True:
        min_storable = None
        efficient_pair = None
        for pair in sorted_incompleted:
            if not row:
                yield pair
                continue

            storable = row.storable([(parents[p], p) for p in pair])
            if storable is None:
                continue

            if storable == 0:
                incompleted.discard(pair)
                continue

            if storable == 1:
                yield pair
                continue

            if min_storable is None or storable < min_storable:
                min_storable = storable
                efficient_pair = pair
        else:
            if not efficient_pair:
                break

        yield efficient_pair
