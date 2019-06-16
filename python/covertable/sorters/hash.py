"""Hash sorter
"""

import hashlib


def sort(incompleted, seed="", *args, **kwargs):
    def comparer(v):
        pair = ",".join(map(str, v))
        return hashlib.md5("{} {}".format(pair, seed).encode("utf-8")).hexdigest()

    for pair in sorted(incompleted, key=comparer):
        yield pair
