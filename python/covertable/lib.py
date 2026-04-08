from functools import reduce
from operator import mul


def get_items(container):
    if isinstance(container, list):
        return list(enumerate(container))
    elif isinstance(container, dict):
        return list(container.items())
    else:
        raise TypeError("factors must be list or dict.")


def prime_generator():
    yield 2
    cand = 3
    while True:
        is_prime = True
        i = 3
        while i * i <= cand:
            if cand % i == 0:
                is_prime = False
                break
            i += 2
        if is_prime:
            yield cand
        cand += 2


def unique(pair):
    total = reduce(mul, pair, 1)
    if total <= 2**53:
        return total
    return str(tuple(sorted(pair)))
