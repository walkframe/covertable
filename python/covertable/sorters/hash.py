"""Hash sorter
"""

import hashlib


def sort(incompleted, md5_cache, seed="", *args, **kwargs):
    def comparer(v):
        if v in md5_cache:
            return md5_cache[v]

        s = "{} {}".format(",".join(map(str, v)), seed)
        md5_cache[v] = value = hashlib.md5(s.encode("utf-8")).hexdigest()
        return value

    return sorted(incompleted, key=comparer)
