from itertools import product, combinations

from . import sorters
from .exceptions import InvalidCondition


cdef get_items(container):
    if isinstance(container, list):
        return enumerate(container)
    elif isinstance(container, dict):
        return container.items()
    else:
        raise TypeError("factors must be list or dict.")


cdef convert_factors_to_serials(factors):
    items = get_items(factors)
    cdef int origin = 0
    cdef dict serials = factors.copy()
    cdef dict parents = {}
    cdef:
        int length
        list serial_list
    for subscript, factor_list in items:
        length = len(factor_list)
        serial_list = []
        for serial in range(origin, origin + length):
            serial_list.append(serial)
            parents[serial] = subscript
        serials[subscript] = serial_list
        origin += length
    return serials, parents


cdef make_incompleted(serials, length):
    cdef set incompleted = set()
    for keys in combinations([k for k, _ in get_items(serials)], length):
        for pair in product(*[serials[keys[i]] for i in range(length)]):
            incompleted.add(pair)
    return incompleted


class Row(dict):
    def __init__(self, row, factors, serials, pre_filter):
        super().__init__(row or {})
        self.type = type(factors)
        self.factors = factors
        self.serials = serials
        self.pre_filter = pre_filter

    def __getitem__(self, item):
        return super().get(item)

    def filled(self):
        return len(self) == len(self.factors)

    def new(self, row=None):
        return Row(row, self.factors, self.serials, self.pre_filter)

    def storable(self, candidate=[]):
        for key, el in candidate:
            if self.get(key, el) != el:
                return False
        if self.pre_filter is None:
            return True
        nxt = self.new({**self, **dict(candidate)})
        return self.pre_filter(nxt.restore())

    def complement(self):
        for k, vs in get_items(self.serials):
            for v in vs:
                if self.storable([(k, v)]):
                    self[k] = v
                    break
        if not self.filled():
            raise InvalidCondition(InvalidCondition.message)
        return self

    def restore(self):
        return self.new(
            [key, self.factors[key][serial - self.serials[key][0]]]
            for key, serial in self.items()
        )


def make(
    factors,
    length=2,
    progress=False,
    sorter=sorters.sequential,
    sort_kwargs={},
    pre_filter=None,
    post_filter=None,
):
    serials, parents = convert_factors_to_serials(factors)
    cdef set incompleted = make_incompleted(serials, length)
    cdef float len_incompleted = float(len(incompleted))
    cdef list rows = []
    row = Row(None, factors, serials, pre_filter)
    # When pre_filter is supecified,
    # it will be applied to incompleted through `row.storable` beforehand.
    for pair in list(filter(lambda _: pre_filter, incompleted)):
        if not row.storable([(parents[p], p) for p in pair]):
            incompleted.discard(pair)

    cdef:
        dict required_args
        list items
        float rate
    while incompleted:
        if row.filled():
            rows.append(row)
            for vs in combinations(sorted(row.values()), length):
                incompleted.discard(tuple(vs))
            row = row.new()

        required_args = {"row": row, "parents": parents, "length": length}
        for pair in sorter.sort(incompleted, **sort_kwargs, **required_args):
            if row.filled():
                break
            items = [(parents[p], p) for p in pair]
            if not row.storable(items):
                continue
            row.update(items)
            incompleted.discard(pair)
        else:
            row.complement()

        if progress:
            rate = (len_incompleted - len(incompleted)) / len_incompleted
            print "{0:.2%}\r".format(rate),

    if row:
        rows.append(row.complement())

    cdef list result = []
    for row in rows:
        restored = row.restore()
        if post_filter and not post_filter(restored):
            continue
        if issubclass(row.type, list):
            result.append([r for _, r in sorted(restored.items())])
        elif issubclass(row.type, dict):
            result.append(dict(restored))
    return result
