from itertools import product, combinations

from . import sorters
from . import criteria
from .exceptions import NotReady, NeverMatch
from .lib import get_items, prime_generator, unique


class ProxyRow(dict):
    """Dict-like object that raises NotReady for missing keys."""
    def __getitem__(self, key):
        if key not in self:
            raise NotReady(key)
        return super().__getitem__(key)


class Row(dict):
    def __init__(self, entries=None):
        super().__init__(entries or {})
        self.consumed = {}

    def get_pair_key(self, *new_pair):
        pair = list(self.values()) + list(new_pair)
        return unique(pair)

    def copy_from(self, other):
        self.update(other)


class Controller:
    def __init__(self, factors, length=2, sorter=None, criterion=None,
                 seed="", tolerance=0, pre_filter=None, post_filter=None):
        self.factors = factors
        self.length = length
        self.sorter = sorter or sorters.hash
        self.criterion = criterion or criteria.greedy
        self.seed = seed
        self.tolerance = tolerance
        self.pre_filter = pre_filter
        self.post_filter = post_filter

        self.serials = {}
        self.parents = {}
        self.indices = {}
        self.incomplete = {}
        self.rejected = set()
        self.row = Row()

        self.factor_length = len(factors)
        self.factor_is_list = isinstance(factors, list)

        self._serialize(factors)
        self._set_incomplete()
        self._num_all_chunks = len(self.incomplete)

        # Delete initial pairs that do not satisfy pre_filter
        for pair_key in list(self.incomplete.keys()):
            pair = self.incomplete[pair_key]
            cand = self.get_candidate(pair)
            s = self.storable(cand)
            if s is None:
                self.incomplete.pop(pair_key, None)

    def _serialize(self, factors):
        origin = 0
        primer = prime_generator()
        for subscript, elements in get_items(factors):
            length = len(elements)
            serial_list = []
            for index in range(origin, origin + length):
                serial = next(primer)
                serial_list.append(serial)
                self.parents[serial] = subscript
                self.indices[serial] = index
            self.serials[subscript] = serial_list
            origin += length

    def _set_incomplete(self):
        pairs = []
        all_keys = [k for k, _ in get_items(self.serials)]
        for keys in combinations(all_keys, self.length):
            comb = [self.serials[keys[i]] for i in range(self.length)]
            for pair in product(*comb):
                pair = tuple(sorted(pair))
                pairs.append(pair)

        sorted_pairs = self.sorter.sort(pairs, seed=self.seed, indices=self.indices)
        for pair in sorted_pairs:
            self.incomplete[unique(pair)] = pair

    def _set_pair(self, pair):
        for key, value in self.get_candidate(pair):
            self.row[key] = value
        for p in combinations(sorted(self.row.values()), self.length):
            self.consume(p)

    def consume(self, pair):
        pair_key = unique(pair)
        if pair_key in self.incomplete:
            del self.incomplete[pair_key]
            self.row.consumed[pair_key] = pair

    def consume_row(self, row):
        for pair in combinations(sorted(row.values()), self.length):
            self.consume(pair)

    def get_candidate(self, pair):
        return [(self.parents[p], p) for p in pair]

    def storable(self, candidate):
        num = 0
        for key, el in candidate:
            existing = self.row.get(key)
            if existing is None:
                num += 1
            elif existing != el:
                return None

        if self.pre_filter is None:
            return num

        candidates = list(self.row.items()) + candidate
        nxt = Row(candidates)
        proxy = self._to_proxy(nxt)
        try:
            ok = self.pre_filter(proxy)
            if not ok:
                self.consume_row(nxt)
                return None
        except NotReady:
            return -num
        except Exception:
            raise
        return num

    def is_filled(self, row=None):
        if row is None:
            row = self.row
        return len(row) == self.factor_length

    def _to_map(self, row):
        result = {}
        for key, serial in row.items():
            index = self.indices[serial]
            first = self.indices[self.serials[key][0]]
            result[key] = self.factors[key][index - first]
        return result

    def _to_proxy(self, row):
        return ProxyRow(self._to_map(row))

    def _to_object(self, row):
        return self._to_map(row)

    def _reset(self):
        for pair_key, pair in self.row.consumed.items():
            self.incomplete[pair_key] = pair
        self.row = Row()

    def _discard(self):
        pair_key = self.row.get_pair_key()
        self.rejected.add(pair_key)
        for pk, pair in self.row.consumed.items():
            self.incomplete[pk] = pair
        self.row = Row()

    def _restore(self):
        row = self.row
        self.row = Row()
        if self.factor_is_list:
            m = self._to_map(row)
            return [v for _, v in sorted(m.items())]
        return self._to_object(row)

    def _close(self):
        trier = Row(self.row.items())
        for k, vs in get_items(self.serials):
            for v in vs:
                pair_key = trier.get_pair_key(v)
                if pair_key in self.rejected:
                    continue
                cand = [(k, v)]
                s = self.storable(cand)
                if s is None:
                    self.rejected.add(pair_key)
                    continue
                trier[k] = v
                break
        self.row.copy_from(trier)
        if self.is_complete:
            return True
        if len(trier) == 0:
            return False
        pair_key = trier.get_pair_key()
        if pair_key in self.rejected:
            raise NeverMatch()
        self.rejected.add(pair_key)
        self._reset()
        return False

    @property
    def is_complete(self):
        if not self.is_filled():
            return False
        if self.pre_filter is None:
            return True
        proxy = self._to_proxy(self.row)
        try:
            return bool(self.pre_filter(proxy))
        except NotReady:
            return False

    @property
    def progress(self):
        if self._num_all_chunks == 0:
            return 0
        return 1 - len(self.incomplete) / self._num_all_chunks

    def make_async(self):
        while True:
            for pair in self.criterion.extract(self):
                if self.is_filled():
                    break
                self._set_pair(pair)
            try:
                complete = self._close()
                if complete:
                    if self.post_filter is None or self.post_filter(self._to_object(self.row)):
                        yield self._restore()
                    else:
                        self._discard()
            except NeverMatch:
                break
            if not self.incomplete:
                break
        self.incomplete.clear()


def make_async(
    factors,
    length=2,
    progress=False,
    sorter=sorters.hash,
    criterion=criteria.greedy,
    pre_filter=None,
    post_filter=None,
    seed="",
    tolerance=0,
    **params,
):
    # backwards compat: extract seed/tolerance from options dict
    options = params.pop("options", {})
    if isinstance(options, dict):
        seed = options.get("seed", seed)
        tolerance = options.get("tolerance", tolerance)

    ctrl = Controller(
        factors,
        length=length,
        sorter=sorter,
        criterion=criterion,
        seed=seed,
        tolerance=tolerance,
        pre_filter=pre_filter,
        post_filter=post_filter,
    )
    for row in ctrl.make_async():
        if progress:
            print("{0:.2%}\r".format(ctrl.progress), end="")
        yield row


def make(
    factors,
    length=2,
    progress=False,
    sorter=sorters.hash,
    criterion=criteria.greedy,
    pre_filter=None,
    post_filter=None,
    seed="",
    tolerance=0,
    **params,
):
    return list(make_async(
        factors,
        length=length,
        progress=progress,
        sorter=sorter,
        criterion=criterion,
        pre_filter=pre_filter,
        post_filter=post_filter,
        seed=seed,
        tolerance=tolerance,
        **params,
    ))
