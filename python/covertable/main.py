from itertools import product, combinations

from . import sorters
from . import criteria
from .exceptions import NotReady, NeverMatch
from .evaluate import evaluate as eval_condition, extract_keys
from .lib import get_items


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
        self.invalid_pairs = set()

    def get_pair_key(self, *new_pair):
        return tuple(sorted(list(self.values()) + list(new_pair)))

    def copy_from(self, other):
        self.update(other)


class Controller:
    def __init__(self, factors, strength=2, sorter=None, criterion=None,
                 salt="", tolerance=0, pre_filter=None, post_filter=None,
                 sub_models=None, presets=None, weights=None,
                 constraints=None, comparer=None):
        self.factors = factors
        self.strength = strength
        self.sub_models = sub_models or []
        self.presets = presets or []
        self.weights = weights or {}
        self.sorter = sorter or sorters.hash
        self.criterion = criterion or criteria.greedy
        self.salt = salt
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

        # Declarative constraints
        self.comparer = comparer or {}
        self._constraints = []          # list of {"condition": ..., "keys": set}
        self._constraints_by_key = {}   # key -> set of constraint indices
        self._passed_indexes = set()    # constraint indices satisfied on current row

        # Stats
        self._total_pairs = 0
        self._pruned_pairs = 0
        self._row_count = 0
        self._uncovered_pairs = []
        self._completions = {}

        self._serialize(factors)
        self._resolve_constraints(constraints)
        self._set_incomplete()
        self._total_pairs = len(self.incomplete)

        # Delete initial pairs that cannot satisfy constraints.
        # Two-pass: first direct violations, then forward checking.
        for pair_key in list(self.incomplete.keys()):
            cand = self.get_candidate(pair_key)
            if self._storable_check(cand) is False:
                self.incomplete.pop(pair_key, None)
            elif self._constraints:
                snapshot = dict(cand)
                if not self._forward_check(snapshot):
                    self.incomplete.pop(pair_key, None)
        self._pruned_pairs = self._total_pairs - len(self.incomplete)
        self._num_all_chunks = len(self.incomplete)

    def _resolve_constraints(self, constraints):
        """Build resolved constraints and per-key index."""
        if not constraints:
            return
        for i, cond in enumerate(constraints):
            keys = extract_keys(cond)
            self._constraints.append({"condition": cond, "keys": keys})
            for k in keys:
                if k not in self._constraints_by_key:
                    self._constraints_by_key[k] = set()
                self._constraints_by_key[k].add(i)

    def _serialize(self, factors):
        origin = 0
        serial = 0
        for subscript, elements in get_items(factors):
            length = len(elements)
            serial_list = []
            for index in range(origin, origin + length):
                serial_list.append(serial)
                self.parents[serial] = subscript
                self.indices[serial] = index
                serial += 1
            self.serials[subscript] = serial_list
            origin += length

    def _set_incomplete(self):
        pairs = []
        all_keys = [k for k, _ in get_items(self.serials)]
        sub_model_key_sets = [set(sm["keys"]) for sm in self.sub_models]

        def is_within_sub_model(keys):
            return any(all(k in ks for k in keys) for ks in sub_model_key_sets)

        # Default strength pairs, excluding combinations fully within a sub-model
        for keys in combinations(all_keys, self.strength):
            if is_within_sub_model(keys):
                continue
            comb = [self.serials[keys[i]] for i in range(self.strength)]
            for pair in product(*comb):
                pairs.append(tuple(sorted(pair)))

        # Sub-model pairs at their own strength
        for sm in self.sub_models:
            for keys in combinations(sm["keys"], sm["strength"]):
                comb = [self.serials[keys[i]] for i in range(sm["strength"])]
                for pair in product(*comb):
                    pairs.append(tuple(sorted(pair)))

        sorted_pairs = self.sorter.sort(pairs, salt=self.salt, indices=self.indices)
        for pair in sorted_pairs:
            self.incomplete[pair] = pair

    # -- constraint evaluation helpers --

    def _storable_check(self, candidate, row=None):
        """Check constraints on (row + candidate).

        Returns True (OK), False (violated), or None (deferred).
        Falls back to pre_filter when no declarative constraints exist.
        """
        if row is None:
            row = self.row

        if self._constraints:
            nxt_obj = None
            for i, rc in enumerate(self._constraints):
                if i in self._passed_indexes:
                    continue
                if nxt_obj is None:
                    nxt = dict(row)
                    nxt.update(candidate)
                    nxt_obj = self._to_map_from_dict(nxt)
                result = eval_condition(rc["condition"], nxt_obj, self.comparer)
                if result is False:
                    return False
            return True

        # Legacy pre_filter path
        if self.pre_filter is None:
            return True
        nxt = dict(row)
        nxt.update(candidate)
        nxt_row = Row(nxt)
        proxy = self._to_proxy(nxt_row)
        try:
            ok = self.pre_filter(proxy)
            if not ok:
                return False
        except NotReady:
            return None
        except Exception:
            raise
        return True

    def _mark_passed_constraints(self, row):
        """Mark constraints that are satisfied on *row*. Returns False if any fails."""
        if not self._constraints:
            return True
        obj = None
        for i, rc in enumerate(self._constraints):
            if i in self._passed_indexes:
                continue
            if obj is None:
                obj = self._to_map_from_dict(row)
            result = eval_condition(rc["condition"], obj, self.comparer)
            if result is True:
                self._passed_indexes.add(i)
            elif result is False:
                return False
        return True

    def _set_pair(self, pair):
        """Legacy: directly set pair into row (used when no constraints)."""
        for key, value in self.get_candidate(pair):
            self.row[key] = value
        for s in self.all_strengths:
            for p in combinations(sorted(self.row.values()), s):
                self.consume(p)

    def set_pair(self, pair):
        """Snapshot-based pair addition with constraint checking.

        Returns True if the pair was committed, False if rejected.
        """
        candidate = self.get_candidate(pair)

        # Build snapshot
        snapshot = dict(self.row)
        snapshot.update(candidate)
        snapshot_obj = self._to_map_from_dict(snapshot)

        # Evaluate all non-passed constraints
        for i, rc in enumerate(self._constraints):
            if i in self._passed_indexes:
                continue
            result = eval_condition(rc["condition"], snapshot_obj, self.comparer)
            if result is False:
                return False

        # Forward check before committing
        if not self._forward_check(snapshot):
            return False

        # Commit
        for key, value in candidate:
            self.row[key] = value
        self._mark_passed_constraints(self.row)
        return True

    def _forward_check(self, snapshot):
        """Propagate constraints to prune domains of unfilled factors.

        *snapshot* is a dict of {key: serial}. Read-only — does not modify self.row.
        Returns False if any domain becomes empty (unsolvable).
        """
        if not self._constraints:
            return True

        # Build initial domains for unfilled factors
        domains = {}
        for key, serials in self.serials.items():
            if key not in snapshot:
                domains[key] = list(serials)
        if not domains:
            return True

        relevant_set = set(range(len(self._constraints)))

        temp_row = dict(snapshot)
        changed = True
        while changed:
            changed = False
            for key in list(domains.keys()):
                domain = domains.get(key)
                if domain is None:
                    continue
                if len(domain) == 0:
                    return False

                key_constraints = self._constraints_by_key.get(key)
                if not key_constraints:
                    continue
                has_relevant = any(ci in relevant_set for ci in key_constraints)
                if not has_relevant:
                    continue

                surviving = []
                for serial in domain:
                    temp_row[key] = serial
                    obj = self._to_map_from_dict(temp_row)
                    viable = True
                    for ci in key_constraints:
                        if ci in self._passed_indexes:
                            continue
                        if eval_condition(self._constraints[ci]["condition"], obj, self.comparer) is False:
                            viable = False
                            break
                    if viable:
                        surviving.append(serial)
                del temp_row[key]

                if len(surviving) == 0:
                    return False
                if len(surviving) < len(domain):
                    domains[key] = surviving
                    changed = True
                    if len(surviving) == 1:
                        temp_row[key] = surviving[0]
                        del domains[key]
                        nc = self._constraints_by_key.get(key)
                        if nc:
                            relevant_set.update(nc)

                # Peer propagation for multi-value domains
                if len(surviving) > 1:
                    for peer_key in list(domains.keys()):
                        if peer_key == key:
                            continue
                        peer_domain = domains.get(peer_key)
                        if peer_domain is None:
                            continue
                        peer_constraints = self._constraints_by_key.get(peer_key)
                        if not peer_constraints:
                            continue
                        # Check if peer shares constraints with this factor
                        if not (peer_constraints & key_constraints):
                            continue

                        peer_viable = set()
                        for serial in surviving:
                            temp_row[key] = serial
                            for ps in peer_domain:
                                if ps in peer_viable:
                                    continue
                                temp_row[peer_key] = ps
                                obj = self._to_map_from_dict(temp_row)
                                ok = True
                                for ci in peer_constraints:
                                    if ci in self._passed_indexes:
                                        continue
                                    if eval_condition(self._constraints[ci]["condition"], obj, self.comparer) is False:
                                        ok = False
                                        break
                                if ok:
                                    peer_viable.add(ps)
                            if peer_key in temp_row:
                                del temp_row[peer_key]
                        if key in temp_row:
                            del temp_row[key]

                        narrowed = [v for v in peer_domain if v in peer_viable]
                        if len(narrowed) == 0:
                            return False
                        if len(narrowed) < len(peer_domain):
                            domains[peer_key] = narrowed
                            changed = True
                            if len(narrowed) == 1:
                                temp_row[peer_key] = narrowed[0]
                                del domains[peer_key]
                                nc = self._constraints_by_key.get(peer_key)
                                if nc:
                                    relevant_set.update(nc)
        return True

    def consume(self, pair):
        if pair in self.incomplete:
            del self.incomplete[pair]
            self.row.consumed[pair] = pair

    def consume_pairs(self, row):
        for s in self.all_strengths:
            for pair in combinations(sorted(row.values()), s):
                p = tuple(pair)
                self.incomplete.pop(p, None)

    def consume_row(self, row):
        for s in self.all_strengths:
            for pair in combinations(sorted(row.values()), s):
                self.consume(pair)

    @property
    def all_strengths(self):
        strengths = {self.strength}
        for sm in self.sub_models:
            strengths.add(sm["strength"])
        return strengths

    def get_candidate(self, pair):
        return [(self.parents[p], p) for p in pair]

    def is_compatible(self, pair):
        """Return new-key count or None if incompatible."""
        num = 0
        for serial in pair:
            key = self.parents[serial]
            existing = self.row.get(key)
            if existing is None:
                num += 1
            elif existing != serial:
                return None
        return num

    def storable(self, candidate, row=None):
        if row is None:
            row = self.row
        num = 0
        for key, el in candidate:
            existing = row.get(key)
            if existing is None:
                num += 1
            elif existing != el:
                return None

        check = self._storable_check(candidate, row)
        if check is False:
            # Consume violated pairs when using legacy pre_filter
            if not self._constraints and self.pre_filter is not None:
                nxt = dict(row)
                nxt.update(candidate)
                nxt_row = Row(nxt)
                self.consume_row(nxt_row)
            return None
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

    def _to_map_from_dict(self, d):
        """Convert a {key: serial} dict to {key: value}."""
        result = {}
        for key, serial in d.items():
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
        self._passed_indexes.clear()

    def _discard(self):
        pair_key = self.row.get_pair_key()
        self.rejected.add(pair_key)
        self.row = Row()
        self._passed_indexes.clear()

    def _restore(self):
        row = self.row
        self.row = Row()
        self._passed_indexes.clear()
        if self.factor_is_list:
            m = self._to_map(row)
            return [v for _, v in sorted(m.items())]
        return self._to_object(row)

    def _order_by_weight(self, key, serials):
        factor_weights = self.weights.get(key) if self.weights else None
        if not factor_weights:
            return serials
        first = self.indices[serials[0]]
        return sorted(
            serials,
            key=lambda s: -factor_weights.get(self.indices[s] - first, 1),
        )

    def _close(self):
        """Fill unfilled factors via depth-first backtracking.

        Returns True on success, or a dict {"conflict_keys": set|None} on failure.
        """
        kvs = list(get_items(self.serials))

        unfilled = []
        for k, vs in kvs:
            if k not in self.row:
                unfilled.append({"key": k, "values": self._order_by_weight(k, vs)})

        if not unfilled:
            self._passed_indexes.clear()
            self._mark_passed_constraints(self.row)
            if self.is_complete:
                return True
            return {"conflict_keys": self._find_conflict_keys()}

        trier = Row(self.row.items())
        depth = len(unfilled)
        idx = [0] * depth
        d = 0
        last_conflict_keys = None

        trier[unfilled[0]["key"]] = unfilled[0]["values"][0]

        while True:
            entry = unfilled[d]
            v = entry["values"][idx[d]]
            cand = [(entry["key"], v)]
            s = self.storable(cand, trier)

            if s is not None:
                if d == depth - 1:
                    self.row.copy_from(trier)
                    self._passed_indexes.clear()
                    self._mark_passed_constraints(self.row)
                    if self.is_complete:
                        return True
                    last_conflict_keys = self._find_conflict_keys()
                else:
                    d += 1
                    idx[d] = 0
                    trier[unfilled[d]["key"]] = unfilled[d]["values"][0]
                    continue

            while True:
                idx[d] += 1
                if idx[d] < len(unfilled[d]["values"]):
                    trier[unfilled[d]["key"]] = unfilled[d]["values"][idx[d]]
                    break
                if unfilled[d]["key"] in trier:
                    del trier[unfilled[d]["key"]]
                d -= 1
                if d < 0:
                    self._reset()
                    return {"conflict_keys": last_conflict_keys}

    def _find_conflict_keys(self):
        """Find keys of first failing constraint on current row."""
        if not self.is_filled():
            return None
        obj = self._to_object(self.row)
        for i, rc in enumerate(self._constraints):
            if i in self._passed_indexes:
                continue
            if eval_condition(rc["condition"], obj, self.comparer) is False:
                return rc["keys"]
        return None

    def _diagnose_uncovered_pairs(self):
        """Analyse remaining pairs and identify failing constraints."""
        result = []
        for pair in self.incomplete.values():
            cand = self.get_candidate(pair)
            pair_obj = {}
            for key, serial in cand:
                idx = self.indices[serial]
                first = self.indices[self.serials[key][0]]
                pair_obj[key] = self.factors[key][idx - first]

            snapshot = dict(cand)
            snapshot_obj = self._to_map_from_dict(snapshot)
            failing = []
            for i, rc in enumerate(self._constraints):
                r = eval_condition(rc["condition"], snapshot_obj, self.comparer)
                if r is False:
                    failing.append(i)
            if not failing:
                pair_keys = set(pair_obj.keys())
                for i, rc in enumerate(self._constraints):
                    for k in rc["keys"]:
                        if k in pair_keys:
                            failing.append(i)
                            break
            result.append({"pair": pair_obj, "constraints": failing})
        return result

    def _record_completions(self, row, greedy_keys):
        """Record factor values filled by close() rather than greedy."""
        for key, serial in row.items():
            if key in greedy_keys:
                continue
            idx = self.indices[serial]
            first = self.indices[self.serials[key][0]]
            value = str(self.factors[key][idx - first])
            key_str = str(key)
            if key_str not in self._completions:
                self._completions[key_str] = {}
            self._completions[key_str][value] = self._completions[key_str].get(value, 0) + 1

    @property
    def is_complete(self):
        if not self.is_filled():
            return False
        if self._constraints:
            obj = self._to_object(self.row)
            for i, rc in enumerate(self._constraints):
                if i in self._passed_indexes:
                    continue
                result = eval_condition(rc["condition"], obj, self.comparer)
                # null (None) = referenced key doesn't exist — treat as satisfied
                if result is False:
                    return False
            return True
        if self.pre_filter is None:
            return True
        proxy = self._to_proxy(self.row)
        try:
            return bool(self.pre_filter(proxy))
        except NotReady:
            return True  # null tolerance: treat unknown as satisfied

    @property
    def stats(self):
        return {
            "total_pairs": self._total_pairs,
            "pruned_pairs": self._pruned_pairs,
            "covered_pairs": self._total_pairs - self._pruned_pairs - len(self.incomplete),
            "progress": 0 if self._total_pairs == 0 else 1 - len(self.incomplete) / self._total_pairs,
            "row_count": self._row_count,
            "uncovered_pairs": self._uncovered_pairs,
            "completions": self._completions,
        }

    @property
    def progress(self):
        return self.stats["progress"]

    def _value_to_serial(self, key, value):
        try:
            factor_values = self.factors[key]
        except (KeyError, IndexError, TypeError):
            return None
        try:
            idx = factor_values.index(value)
        except (ValueError, AttributeError):
            return None
        serial_list = self.serials.get(key)
        if not serial_list:
            return None
        return serial_list[idx]

    def _apply_preset(self, preset):
        entries = []
        for key, value in get_items(preset):
            serial = self._value_to_serial(key, value)
            if serial is None:
                return False
            entries.append((key, serial))
        if not entries:
            return False
        for key, serial in entries:
            self.row[key] = serial
        for s in self.all_strengths:
            for pair in combinations(sorted(self.row.values()), s):
                self.consume(pair)
        return True

    def make_async(self):
        has_constraints = bool(self._constraints)

        # Process presets
        for preset in self.presets:
            if not self._apply_preset(preset):
                continue
            preset_keys = set(self.row.keys())
            try:
                result = self._close()
                if result is True:
                    self._record_completions(self.row, preset_keys)
                    self.consume_pairs(self.row)
                    self._row_count += 1
                    if self.post_filter is None or self.post_filter(self._to_object(self.row)):
                        yield self._restore()
                    else:
                        self._discard()
                else:
                    self._reset()
            except NeverMatch:
                self.row = Row()
                self._passed_indexes.clear()

        consecutive_failures = 0
        while self.incomplete:
            # Phase 1: greedy selects pairs, setPair validates via snapshot
            if has_constraints:
                for pair in self.criterion.extract(self):
                    if self.is_filled():
                        break
                    pk = pair
                    if pk in self.row.invalid_pairs:
                        continue
                    if not self.set_pair(pair):
                        self.row.invalid_pairs.add(pk)
            else:
                for pair in self.criterion.extract(self):
                    if self.is_filled():
                        break
                    self._set_pair(pair)

            greedy_keys = set(self.row.keys())

            # Phase 2: close
            try:
                result = self._close()
                if result is True:
                    self._record_completions(self.row, greedy_keys)
                    self.consume_pairs(self.row)
                    self._row_count += 1
                    if self.post_filter is None or self.post_filter(self._to_object(self.row)):
                        yield self._restore()
                    else:
                        self._discard()
                    consecutive_failures = 0
                else:
                    consecutive_failures += 1
                    if consecutive_failures > len(self.incomplete):
                        break
                    # Carry invalidPairs into next attempt
                    failed_pairs = set(self.row.invalid_pairs)
                    for s in self.all_strengths:
                        for p in combinations(sorted(self.row.values()), s):
                            failed_pairs.add(tuple(p))
                    self._reset()
                    self.rejected.clear()
                    self.row.invalid_pairs.update(failed_pairs)
            except NeverMatch:
                if has_constraints:
                    self._reset()
                    self.rejected.clear()
                    continue
                break
            if not self.incomplete:
                break

        # Phase 3 (rescue): try remaining pairs individually
        for pair in list(self.incomplete.values()):
            self._reset()
            if has_constraints:
                if not self.set_pair(pair):
                    continue
            else:
                self._set_pair(pair)
            rescue_keys = set(self.row.keys())
            result = self._close()
            if result is True:
                self._record_completions(self.row, rescue_keys)
                self.consume_pairs(self.row)
                self._row_count += 1
                if self.post_filter is None or self.post_filter(self._to_object(self.row)):
                    yield self._restore()
                else:
                    self._discard()
            else:
                self._reset()

        if self.incomplete and self._constraints:
            self._uncovered_pairs = self._diagnose_uncovered_pairs()

        self.incomplete.clear()


def make_async(
    factors,
    strength=2,
    progress=False,
    sorter=sorters.hash,
    criterion=criteria.greedy,
    pre_filter=None,
    post_filter=None,
    salt="",
    tolerance=0,
    sub_models=None,
    presets=None,
    weights=None,
    constraints=None,
    comparer=None,
    **params,
):
    # backwards compat: extract salt/tolerance from options dict
    options = params.pop("options", {})
    if isinstance(options, dict):
        salt = options.get("salt", salt)
        tolerance = options.get("tolerance", tolerance)

    ctrl = Controller(
        factors,
        strength=strength,
        sorter=sorter,
        criterion=criterion,
        salt=salt,
        tolerance=tolerance,
        pre_filter=pre_filter,
        post_filter=post_filter,
        sub_models=sub_models,
        presets=presets,
        weights=weights,
        constraints=constraints,
        comparer=comparer,
    )
    for row in ctrl.make_async():
        if progress:
            print("{0:.2%}\r".format(ctrl.progress), end="")
        yield row


def make(
    factors,
    strength=2,
    progress=False,
    sorter=sorters.hash,
    criterion=criteria.greedy,
    pre_filter=None,
    post_filter=None,
    salt="",
    tolerance=0,
    sub_models=None,
    presets=None,
    weights=None,
    constraints=None,
    comparer=None,
    **params,
):
    return list(make_async(
        factors,
        strength=strength,
        progress=progress,
        sorter=sorter,
        criterion=criterion,
        pre_filter=pre_filter,
        post_filter=post_filter,
        salt=salt,
        tolerance=tolerance,
        sub_models=sub_models,
        presets=presets,
        weights=weights,
        constraints=constraints,
        comparer=comparer,
        **params,
    ))
