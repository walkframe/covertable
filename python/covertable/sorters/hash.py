"""Hash sorter
"""


def fnv1a32(s):
    h = 0x811C9DC5
    for c in s.encode("utf-8"):
        h ^= c
        h = (h * 0x01000193) & 0xFFFFFFFF
    return format(h, '08x')


def sort(pairs, salt="", indices=None, **kwargs):
    def comparer(pair):
        if indices:
            key = "{} {}".format(",".join(str(indices[n]) for n in pair), salt)
        else:
            key = "{} {}".format(",".join(str(n) for n in pair), salt)
        return fnv1a32(key)

    return sorted(pairs, key=comparer)
