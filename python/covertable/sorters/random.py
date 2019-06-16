"""Random sorter
"""

import random


def random_comparer(_):
    return random.random()


def sort(incompleted, *args, **kwargs):
    for pair in sorted(incompleted, key=random_comparer):
        yield pair
