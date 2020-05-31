from itertools import product, combinations

from . import sorters
from . import criteria
from .exceptions import InvalidCondition


def get_items(container):
    if isinstance(container, list):
        return enumerate(container)
    elif isinstance(container, dict):
        return container.items()
    else:
        raise TypeError("factors must be list or dict.")


def convert_factors_to_serials(factors):
    items = get_items(factors)
    origin = 0
    serials, parents = factors.copy(), {}
    for subscript, factor_list in items:
        length = len(factor_list)
        serial_list = []
        for serial in range(origin, origin + length):
            serial_list.append(serial)
            parents[serial] = subscript
        serials[subscript] = serial_list
        origin += length
    return serials, parents


def make_incompleted(serials, length):
    incompleted = set()
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
        num = 0
        for key, el in candidate:
            _el = self.get(key)
            if _el is None:
                num += 1
            elif _el != el:
                return None
        if self.pre_filter is None:
            return num
        nxt = self.new({**self, **dict(candidate)})
        if not self.pre_filter(nxt.restore()):
            return None
        return num

    def complement(self):
        for k, vs in get_items(self.serials):
            for v in vs:
                if self.storable([(k, v)]) is not None:
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
    sorter=sorters.hash,
    criterion=criteria.greedy,
    options={},
    pre_filter=None,
    post_filter=None,
):
    serials, parents = convert_factors_to_serials(factors)
    incompleted = make_incompleted(serials, length)
    len_incompleted = float(len(incompleted))
    md5_cache = {}

    rows, row = [], Row(None, factors, serials, pre_filter)
    # When pre_filter is specified,
    # it will be applied to incompleted through `row.storable` beforehand.
    for pair in list(filter(lambda _: pre_filter, incompleted)):
        if not row.storable([(parents[p], p) for p in pair]):
            incompleted.discard(pair)

    while incompleted:
        if row.filled():
            rows.append(row)
            row = row.new()

        common_kwargs = {
            "row": row,
            "parents": parents,
            "length": length,
            "incompleted": incompleted,
            "md5_cache": md5_cache,
        }
        sorted_incompleted = sorter.sort(**common_kwargs, **options)

        for pair in criterion.extract(sorted_incompleted, **common_kwargs, **options):
            if row.filled():
                break
            row.update((parents[p], p) for p in pair)
            for vs in combinations(sorted(row.values()), length):
                incompleted.discard(vs)
        else:
            if not row.filled():
                row.complement()

        if progress:
            rate = (len_incompleted - len(incompleted)) / len_incompleted
            print("{0:.2%}\r".format(rate), end="")

    if row:
        rows.append(row.complement())

    result = []
    for row in rows:
        restored = row.restore()
        if post_filter and not post_filter(restored):
            continue
        if issubclass(row.type, list):
            result.append([r for _, r in sorted(restored.items())])
        elif issubclass(row.type, dict):
            result.append(dict(restored))
    return result
