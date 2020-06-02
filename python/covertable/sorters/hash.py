"""Hash sorter
"""

import hashlib


def sort(incompleted, md5_cache, seed="", use_cache=True, *args, **kwargs):
    def comparer(v):
        if use_cache and v in md5_cache:
            return md5_cache[v]

        s = "{} {}".format(",".join(map(str, v)), seed)
        value = hashlib.md5(s.encode("utf-8")).hexdigest()
        if use_cache:
            md5_cache[v] = value
        return value

    return sorted(incompleted, key=comparer)
