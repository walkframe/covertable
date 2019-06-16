"""Sequential sorter
"""


def sort(incompleted, *args, **kwargs):
    for pair in frozenset(incompleted):
        yield pair
