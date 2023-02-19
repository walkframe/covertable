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


def make_incomplete(serials, length):
    incomplete = set()
    for keys in combinations([k for k, _ in get_items(serials)], length):
        for pair in product(*[serials[keys[i]] for i in range(length)]):
            incomplete.add(pair)
    return incomplete


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
        if not self.pre_filter(nxt.resolve()):
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

    def resolve(self):
        return self.new(
            [key, self.factors[key][serial - self.serials[key][0]]]
            for key, serial in self.items()
        )

    def restore(self):
        resolved = self.resolve()
        if issubclass(self.type, list):
            return [r for _, r in sorted(resolved.items())]
        if issubclass(self.type, dict):
            return dict(resolved)


def make_async(
    factors,
    length=2,
    progress=False,
    sorter=sorters.hash,
    criterion=criteria.greedy,
    pre_filter=None,
    post_filter=None,
    **params,
):
    serials, parents = convert_factors_to_serials(factors)
    incomplete = make_incomplete(serials, length)
    len_incomplete = float(len(incomplete))
    md5_cache = {}

    row = Row(None, factors, serials, pre_filter)
    # When pre_filter is specified,
    # it will be applied to incomplete through `row.storable` beforehand.
    for pair in list(filter(lambda _: pre_filter, incomplete)):
        if not row.storable([(parents[p], p) for p in pair]):
            incomplete.discard(pair)

    while incomplete:
        if row.filled():
            if post_filter is None or post_filter(row.resolve()):
                yield row.restore()
            row = row.new()

        common_kwargs = {
            **params,
            "row": row,
            "parents": parents,
            "length": length,
            "incomplete": incomplete,
            "md5_cache": md5_cache,
        }
        sorted_incomplete = sorter.sort(**common_kwargs)
        for pair in criterion.extract(sorted_incomplete, **common_kwargs):
            if row.filled():
                break
            row.update((parents[p], p) for p in pair)
            for vs in combinations(sorted(row.values()), length):
                incomplete.discard(vs)
        else:
            if not row.filled():
                row.complement()

        if progress:
            rate = (len_incomplete - len(incomplete)) / len_incomplete
            print("{0:.2%}\r".format(rate), end="")

    if row:
        row.complement()
        if post_filter is None or post_filter(row.resolve()):
            yield row.restore()


def make(
    factors,
    length=2,
    progress=False,
    sorter=sorters.hash,
    criterion=criteria.greedy,
    pre_filter=None,
    post_filter=None,
    **params,
):
    gen = make_async(
        factors,
        length=length,
        progress=progress,
        sorter=sorter,
        criterion=criterion,
        pre_filter=pre_filter,
        post_filter=post_filter,
        **params,
    )
    return list(gen)
