"""Simulated-annealing post-processor for covering arrays (Python port).

This is a faithful port of ``typescript/src/optimize.ts``: it takes a covering
array produced by :func:`covertable.make` and shrinks it with simulated
annealing while preserving every t-tuple the input covered and satisfying every
constraint. The algorithm and the public-API semantics mirror the TypeScript
reference; only runtime-specific concerns differ (Python uses ``multiprocessing``
for the cooperative island model instead of Web/Worker threads, because of the
GIL).

Public entry points are exposed as ``Controller.optimize`` /
``Controller.optimize_parallel`` (see ``main.py``); ``strength``,
``constraints``, and ``comparer`` are read from the Controller so they can never
drift out of sync with the ``make`` run.
"""

from itertools import combinations
from math import exp
from time import perf_counter

from .evaluate import evaluate as eval_condition
from .lib import get_items


# ---------------------------------------------------------------------------
# PRNG (mulberry32) — faithful port of the TS generator so a given seed is
# reproducible. Kept in unsigned-32-bit arithmetic throughout.
# ---------------------------------------------------------------------------


def mulberry32(seed):
    a = seed & 0xFFFFFFFF

    def rng():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = (a ^ (a >> 15)) * (a | 1) & 0xFFFFFFFF
        m = (t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF
        t = ((t + m) & 0xFFFFFFFF) ^ t
        return (t ^ (t >> 14)) / 4294967296.0

    return rng


def _now_ms():
    return perf_counter() * 1000.0


# ---------------------------------------------------------------------------
# Constraint normalization (mirrors Controller._normalize_condition): the SA
# receives already-normalized conditions from the Controller, but the parallel
# worker path re-normalizes defensively, so keep a local copy here too.
# ---------------------------------------------------------------------------


def _normalize_condition(c):
    op = c.get("operator")
    if op == "in" and isinstance(c.get("values"), list):
        return {**c, "values": set(c["values"])}
    if op in ("and", "or"):
        return {**c, "conditions": [_normalize_condition(x) for x in c["conditions"]]}
    if op == "not":
        return {**c, "condition": _normalize_condition(c["condition"])}
    return c


def _uses_functions(comparer, constraints):
    """True when a custom comparer or an ``fn`` constraint is present.

    Such runs cannot cross a process boundary (functions are not picklable), so
    ``optimize_parallel`` falls back to a single process — matching the TS check.
    """
    if comparer:
        return True

    def walk(c):
        op = c.get("operator")
        if op == "fn":
            return True
        if op in ("and", "or"):
            return any(walk(x) for x in c["conditions"])
        if op == "not":
            return walk(c["condition"])
        return False

    return any(walk(c) for c in constraints)


# ---------------------------------------------------------------------------
# SA core — general t. State is an integer-encoded list[list[int]] where each
# cell holds the index of the chosen value within its factor's value list.
# See the TS reference for the full commentary; this mirrors it closely.
# ---------------------------------------------------------------------------

COOP_STOP = 2
COOP_STAGE = 3


class SAOptimizer:
    def __init__(self, keys, values_per_factor, int_rows, strength,
                 constraints, comparer, seed):
        self.keys = keys
        self.values_per_factor = values_per_factor
        self.levels = [len(v) for v in values_per_factor]
        self.K = len(keys)
        self.t = strength
        self.t2 = strength == 2
        self.rng = mulberry32(seed)
        self.constraints = constraints
        self.has_constraints = len(constraints) > 0
        self.comparer = comparer

        # min-collateral sampling width for targeted moves (1 = plain random row)
        self.min_collateral_samples = 1
        # Reheat: if an anneal run goes ``reheat_stuck`` iterations without
        # improving on its best energy, jump the temperature back up to
        # ``start_temperature * reheat_frac`` (optionally restoring the best
        # config first) instead of freezing at the cooled temperature. This is
        # what lets the hard endgame (last row) actually crack; without it a
        # long cool-down freezes into a local minimum. ``reheat_stuck = 0``
        # disables it. It only engages while the array is at or below
        # ``reheat_max_rows`` (the tight endgame of small arrays); larger arrays
        # still descend fine under plain cooling and reheat's restore-to-best
        # would only stall them. ``reheat_armed`` is set by the reduce loops.
        self.reheat_stuck = 200000
        self.reheat_frac = 0.3
        self.reheat_restore = True
        self.reheat_max_rows = 96
        self.reheat_armed = False
        # cooperative-cancellation hooks (single-thread + coop paths check these)
        self.cancel = None          # object with .is_set(); or None
        self.coop_channel = None

        # --- build column-combinations and dense tuple ids ---
        combos = [list(c) for c in combinations(range(self.K), self.t)]
        self.M = len(combos)
        self.combo_cols = [0] * (self.M * self.t)
        self.combo_stride = [0] * (self.M * self.t)
        self.combo_base = [0] * self.M

        col_combos_tmp = [[] for _ in range(self.K)]
        col_pos_tmp = [[] for _ in range(self.K)]

        offset = 0
        for m in range(self.M):
            cols = combos[m]
            acc = 1
            for pos in range(self.t - 1, -1, -1):
                col = cols[pos]
                self.combo_cols[m * self.t + pos] = col
                self.combo_stride[m * self.t + pos] = acc
                acc *= self.levels[col]
                col_combos_tmp[col].append(m)
                col_pos_tmp[col].append(pos)
            self.combo_base[m] = offset
            offset += acc
        self.T = offset

        self.tuple_combo = [0] * self.T
        for m in range(self.M):
            base = self.combo_base[m]
            end = self.combo_base[m + 1] if m + 1 < self.M else self.T
            for tid in range(base, end):
                self.tuple_combo[tid] = m

        self.col_combos = [list(a) for a in col_combos_tmp]
        self.col_pos = [list(a) for a in col_pos_tmp]

        # --- t=2 fast-path tables: direct pair id + O(1) tuple decode ---
        if self.t2:
            self.pair_base = [0] * (self.K * self.K)
            self.dec_i = [0] * self.T
            self.dec_j = [0] * self.T
            self.dec_vi = [0] * self.T
            self.dec_vj = [0] * self.T
            for m in range(self.M):
                i = self.combo_cols[m * 2]
                j = self.combo_cols[m * 2 + 1]  # i < j
                base = self.combo_base[m]
                self.pair_base[i * self.K + j] = base
                tid = base
                for vi in range(self.levels[i]):
                    for vj in range(self.levels[j]):
                        self.dec_i[tid] = i
                        self.dec_j[tid] = j
                        self.dec_vi[tid] = vi
                        self.dec_vj[tid] = vj
                        tid += 1

        # --- target set: every t-tuple realized by the original input ---
        self.is_target = bytearray(self.T)
        for row in int_rows:
            for m in range(self.M):
                self.is_target[self._combo_id(row, m)] = 1

        self.cov = [0] * self.T
        self.unc_list = [0] * self.T
        self.unc_pos = [0] * self.T
        self.unc_len = 0

        # reusable buffer for constraint checks
        self._obj_buf = {}

    def _combo_id(self, row, m):
        off = m * self.t
        tid = self.combo_base[m]
        cc = self.combo_cols
        cs = self.combo_stride
        for pos in range(self.t):
            tid += row[cc[off + pos]] * cs[off + pos]
        return tid

    def _add_unc(self, tid):
        self.unc_pos[tid] = self.unc_len
        self.unc_list[self.unc_len] = tid
        self.unc_len += 1

    def _del_unc(self, tid):
        p = self.unc_pos[tid]
        self.unc_len -= 1
        last = self.unc_list[self.unc_len]
        self.unc_list[p] = last
        self.unc_pos[last] = p
        self.unc_pos[tid] = -1

    def _build(self, rows):
        cov = self.cov
        for i in range(self.T):
            cov[i] = 0
        for row in rows:
            for m in range(self.M):
                cov[self._combo_id(row, m)] += 1
        self.unc_len = 0
        is_target = self.is_target
        for tid in range(self.T):
            if is_target[tid] and cov[tid] == 0:
                self._add_unc(tid)

    def _set_cell(self, rows, r, k, w):
        row = rows[r]
        v = row[k]
        if v == w:
            return

        cov = self.cov
        is_t = self.is_target

        if self.t2:
            K = self.K
            pb = self.pair_base
            lv = self.levels
            for j in range(K):
                if j == k:
                    continue
                if k < j:
                    b = pb[k * K + j] + row[j]
                    lj = lv[j]
                    old_id = b + v * lj
                    new_id = b + w * lj
                else:
                    b = pb[j * K + k] + row[j] * lv[k]
                    old_id = b + v
                    new_id = b + w
                cov[old_id] -= 1
                if cov[old_id] == 0 and is_t[old_id]:
                    self._add_unc(old_id)
                if cov[new_id] == 0 and is_t[new_id]:
                    self._del_unc(new_id)
                cov[new_id] += 1
            row[k] = w
            return

        combos = self.col_combos[k]
        poss = self.col_pos[k]
        t = self.t
        cs = self.combo_stride
        for x in range(len(combos)):
            m = combos[x]
            stride = cs[m * t + poss[x]]
            old_id = self._combo_id(row, m)  # row[k] still == v here
            new_id = old_id - v * stride + w * stride
            cov[old_id] -= 1
            if cov[old_id] == 0 and is_t[old_id]:
                self._add_unc(old_id)
            if cov[new_id] == 0 and is_t[new_id]:
                self._del_unc(new_id)
            cov[new_id] += 1
        row[k] = w

    def _to_obj(self, row):
        obj = self._obj_buf
        keys = self.keys
        vpf = self.values_per_factor
        for k in range(self.K):
            obj[keys[k]] = vpf[k][row[k]]
        return obj

    def is_valid_row(self, row):
        if not self.has_constraints:
            return True
        obj = self._to_obj(row)
        for c in self.constraints:
            if eval_condition(c, obj, self.comparer) is False:
                return False
        return True

    def _force_tuple(self, rows, r, tid, u_r, u_k, u_v):
        """Force tuple ``tid`` into row ``r``, recording undo entries from 0.

        Returns the number of cells changed. Consumes no RNG.
        """
        n = 0
        row = rows[r]
        if self.t2:
            i = self.dec_i[tid]
            j = self.dec_j[tid]
            vi = self.dec_vi[tid]
            vj = self.dec_vj[tid]
            if row[i] != vi:
                u_r[n] = r; u_k[n] = i; u_v[n] = row[i]; n += 1
                self._set_cell(rows, r, i, vi)
            if row[j] != vj:
                u_r[n] = r; u_k[n] = j; u_v[n] = row[j]; n += 1
                self._set_cell(rows, r, j, vj)
        else:
            t = self.t
            lv = self.levels
            m = self.tuple_combo[tid]
            base = self.combo_base[m]
            for pos in range(t):
                col = self.combo_cols[m * t + pos]
                stride = self.combo_stride[m * t + pos]
                val = (tid - base) // stride % lv[col]
                if row[col] != val:
                    u_r[n] = r; u_k[n] = col; u_v[n] = row[col]; n += 1
                    self._set_cell(rows, r, col, val)
        return n

    def _anneal(self, rows, iters, start_temperature, cool, targeted_move_rate, deadline):
        self._build(rows)
        energy = self.unc_len
        temp = start_temperature
        K = self.K
        rng = self.rng
        lv = self.levels
        n_rows = len(rows)
        cap = max(self.t, 1)
        u_r = [0] * cap
        u_k = [0] * cap
        u_v = [0] * cap
        set_cell = self._set_cell
        force_tuple = self._force_tuple
        has_constraints = self.has_constraints
        mcs = self.min_collateral_samples
        cancel = self.cancel
        coop = self.coop_channel

        # Reheat state: escape a frozen cool-down by jumping T back up when stuck.
        # Gated on `reheat_armed` so it only engages in the tight endgame.
        reheat_stuck = self.reheat_stuck if (self.reheat_stuck > 0 and self.reheat_armed) else 0
        reheat_temp = start_temperature * self.reheat_frac
        best_energy = energy
        since_improve = 0
        best_snap = ([row[:] for row in rows]
                     if reheat_stuck > 0 and self.reheat_restore else None)

        for it in range(iters):
            if energy == 0:
                return 0
            if (it & 8191) == 0:
                if _now_ms() > deadline:
                    break
                if cancel is not None and cancel.is_set():
                    break
                if coop is not None and coop.should_stop():
                    break

            n = 0
            if self.unc_len > 0 and rng() < targeted_move_rate:
                tid = self.unc_list[int(rng() * self.unc_len)]
                if mcs > 1:
                    best_r = -1
                    best_de = float("inf")
                    best_valid = False
                    for _ in range(mcs):
                        rr = int(rng() * n_rows)
                        nn = force_tuple(rows, rr, tid, u_r, u_k, u_v)
                        de = self.unc_len - energy
                        valid = (not has_constraints) or self.is_valid_row(rows[rr])
                        for x in range(nn - 1, -1, -1):
                            set_cell(rows, u_r[x], u_k[x], u_v[x])
                        if best_r < 0 or (valid and not best_valid) or \
                                (valid == best_valid and de < best_de):
                            best_r = rr
                            best_de = de
                            best_valid = valid
                    r = best_r
                else:
                    r = int(rng() * n_rows)
                n = force_tuple(rows, r, tid, u_r, u_k, u_v)
                if n == 0:
                    r = int(rng() * n_rows)
                    k = int(rng() * K)
                    w = int(rng() * lv[k])
                    u_r[n] = r; u_k[n] = k; u_v[n] = rows[r][k]; n += 1
                    set_cell(rows, r, k, w)
            else:
                r = int(rng() * n_rows)
                k = int(rng() * K)
                w = int(rng() * lv[k])
                u_r[n] = r; u_k[n] = k; u_v[n] = rows[r][k]; n += 1
                set_cell(rows, r, k, w)

            # reject moves that make the touched row (always row r) invalid
            if has_constraints and not self.is_valid_row(rows[r]):
                for x in range(n - 1, -1, -1):
                    set_cell(rows, u_r[x], u_k[x], u_v[x])
                temp *= cool
                continue

            after = self.unc_len
            d_e = after - energy
            if d_e <= 0 or rng() < exp(-d_e / temp):
                energy = after
            else:
                for x in range(n - 1, -1, -1):
                    set_cell(rows, u_r[x], u_k[x], u_v[x])
            # Reheat: track the best energy; if stuck too long, restore the best
            # config and jump the temperature back up to escape the basin.
            if reheat_stuck > 0:
                if energy < best_energy:
                    best_energy = energy
                    since_improve = 0
                    if best_snap is not None:
                        for rr in range(len(rows)):
                            a = best_snap[rr]
                            b = rows[rr]
                            for k in range(K):
                                a[k] = b[k]
                else:
                    since_improve += 1
                    if since_improve >= reheat_stuck:
                        if best_snap is not None:
                            for rr in range(len(rows)):
                                a = rows[rr]
                                b = best_snap[rr]
                                for k in range(K):
                                    a[k] = b[k]
                            self._build(rows)
                            energy = self.unc_len
                        temp = reheat_temp
                        since_improve = 0
            temp *= cool

        return self.unc_len

    def _seed(self, rows):
        """Drop the row covering the fewest target tuples uniquely (cov == 1)."""
        self._build(rows)
        best_i = 0
        best_s = float("inf")
        is_target = self.is_target
        cov = self.cov
        for r in range(len(rows)):
            row = rows[r]
            s = 0
            for m in range(self.M):
                tid = self._combo_id(row, m)
                if is_target[tid] and cov[tid] == 1:
                    s += 1
            if s < best_s:
                best_s = s
                best_i = r
        return [row[:] for i, row in enumerate(rows) if i != best_i]

    def reduce(self, rows, budget_ms, initial_iterations, iteration_growth,
               start_temperature, end_temperature, targeted_move_rate,
               on_progress=None):
        """Anytime reduction: repeatedly attempt N -> N-1 by annealing."""
        start = _now_ms()
        deadline = start + budget_ms
        cur = [row[:] for row in rows]
        best = cur

        def cancelled():
            return self.cancel is not None and self.cancel.is_set()

        while len(cur) > 1 and _now_ms() < deadline and not cancelled():
            cracked = None
            iters = initial_iterations
            self.reheat_armed = len(cur) <= self.reheat_max_rows
            while _now_ms() < deadline and not cancelled():
                cool = (end_temperature / start_temperature) ** (1.0 / max(1, iters))
                trial = self._seed(cur)
                if self._anneal(trial, iters, start_temperature, cool,
                                targeted_move_rate, deadline) == 0:
                    cracked = trial
                    break
                iters = int(iters * iteration_growth)
            if cracked is None:
                break
            cur = cracked
            best = cur
            if on_progress is not None:
                on_progress({"rows": len(cur), "elapsed_ms": _now_ms() - start})
        return best

    def reduce_cooperative(self, rows, budget_ms, initial_iterations,
                           iteration_growth, start_temperature, end_temperature,
                           targeted_move_rate, ch, on_crack=None):
        """Cooperative (island-model) reduction over a shared blackboard."""
        start = _now_ms()
        deadline = start + budget_ms
        self.coop_channel = ch
        cur = [row[:] for row in rows]
        local_n = len(cur)
        stage_iters = 0
        cur_iters = initial_iterations

        while local_n > 1 and _now_ms() < deadline and not ch.should_stop():
            # merge: behind the leader AND stalled past patience x leader stage cost
            if not ch.is_scout and local_n > ch.best_rows():
                sc = ch.stage_cost(local_n)
                if sc > 0 and stage_iters > ch.patience * sc:
                    adopted = ch.adopt()
                    if adopted is not None and len(adopted) < local_n:
                        cur = adopted
                        local_n = len(adopted)
                        stage_iters = 0
                        cur_iters = initial_iterations
                        continue
            self.reheat_armed = local_n <= self.reheat_max_rows
            cool = (end_temperature / start_temperature) ** (1.0 / max(1, cur_iters))
            trial = self._seed(cur)
            e = self._anneal(trial, cur_iters, start_temperature, cool,
                             targeted_move_rate, deadline)
            stage_iters += cur_iters
            if e == 0:
                cur = trial
                new_n = local_n - 1
                ch.publish(new_n, cur, stage_iters, local_n)
                if on_crack is not None:
                    on_crack(new_n, _now_ms() - start)
                local_n = new_n
                stage_iters = 0
                cur_iters = initial_iterations
            else:
                cur_iters = int(cur_iters * iteration_growth)
        return cur

    def verify(self, rows):
        """Independent safety valve: recompute coverage and constraints."""
        for row in rows:
            if not self.is_valid_row(row):
                return False
        covered = bytearray(self.T)
        for row in rows:
            for m in range(self.M):
                covered[self._combo_id(row, m)] = 1
        is_target = self.is_target
        for tid in range(self.T):
            if is_target[tid] and not covered[tid]:
                return False
        return True


# ---------------------------------------------------------------------------
# Encode / decode
# ---------------------------------------------------------------------------


def prepare_optimize(rows, factors):
    """Encode input rows to integer indices and build a decode closure."""
    factor_is_list = isinstance(factors, list)
    items = get_items(factors)
    keys = [k for k, _ in items]
    values_per_factor = [v for _, v in items]
    K = len(keys)

    def decode(int_row):
        if factor_is_list:
            return [values_per_factor[k][idx] for k, idx in enumerate(int_row)]
        return {keys[k]: values_per_factor[k][int_row[k]] for k in range(K)}

    int_rows = []
    for row in rows:
        encoded = [0] * K
        for k in range(K):
            value = row[k] if factor_is_list else row[keys[k]]
            try:
                idx = values_per_factor[k].index(value)
            except ValueError:
                idx = -1
            if idx == -1:
                raise ValueError(
                    "optimize: value {!r} for factor {!r} is not one of the "
                    "declared factor values".format(value, keys[k])
                )
            encoded[k] = idx
        int_rows.append(encoded)

    return keys, values_per_factor, K, int_rows, decode


def _controller_config(ctrl):
    """Read strength / constraints / comparer from the Controller.

    The Controller stores already-normalized conditions in ``_constraints``; we
    reuse them so the same constraints drive both ``make`` and ``optimize``.
    """
    strength = ctrl.strength
    constraints = [rc["condition"] for rc in getattr(ctrl, "_constraints", [])]
    comparer = getattr(ctrl, "comparer", None) or {}
    return strength, constraints, comparer


# ---------------------------------------------------------------------------
# Tuning helper
# ---------------------------------------------------------------------------


_DEFAULTS = {
    "budget_ms": 1000,
    "seed": 0x9E3779B9,
    "on_progress": None,
    "cancel": None,
    "initial_iterations": 400000,
    "iteration_growth": 1.6,
    "start_temperature": 2.5,
    "end_temperature": 0.02,
    "targeted_move_rate": 0.5,
    "min_collateral_samples": 1,
    "workers": 1,
}


def _resolve_tuning(tuning):
    t = dict(_DEFAULTS)
    if tuning:
        t.update(tuning)
    return t


# ---------------------------------------------------------------------------
# Public API — single process
# ---------------------------------------------------------------------------


def optimize(ctrl, rows, tuning=None):
    """Post-process a covering array with simulated annealing (single process).

    Preserves every t-tuple the input covered and every constraint (verified
    independently before returning). Returns the input unchanged if it cannot be
    improved. Never mutates its arguments.
    """
    t = _resolve_tuning(tuning)
    strength, constraints, comparer = _controller_config(ctrl)
    keys, values_per_factor, K, int_rows, decode = prepare_optimize(rows, ctrl.factors)

    if len(int_rows) <= 1 or K < strength:
        return [decode(r) for r in int_rows]

    norm_constraints = [_normalize_condition(c) for c in constraints]
    sa = SAOptimizer(keys, values_per_factor, int_rows, strength,
                     norm_constraints, comparer, t["seed"])
    sa.min_collateral_samples = max(1, int(t["min_collateral_samples"]))
    sa.cancel = t["cancel"]

    best = sa.reduce(
        int_rows, t["budget_ms"], t["initial_iterations"], t["iteration_growth"],
        t["start_temperature"], t["end_temperature"], t["targeted_move_rate"],
        t["on_progress"],
    )

    chosen = best if sa.verify(best) else int_rows
    return [decode(r) for r in chosen]


# ---------------------------------------------------------------------------
# Parallel (cooperative island-model portfolio) — optimize_parallel
# ---------------------------------------------------------------------------

# Default strategy portfolio (mirrors DEFAULT_PORTFOLIO in the TS reference).
_DEFAULT_PORTFOLIO = [
    {"min_collateral_samples": 1, "targeted_move_rate": 0.5},
    {"min_collateral_samples": 4, "targeted_move_rate": 0.5},
    {"min_collateral_samples": 1, "targeted_move_rate": 0.5},
    {"min_collateral_samples": 8, "targeted_move_rate": 0.5},
    {"min_collateral_samples": 4, "targeted_move_rate": 0.7},
    {"min_collateral_samples": 1, "targeted_move_rate": 0.3},
    {"min_collateral_samples": 2, "targeted_move_rate": 0.6},
    {"min_collateral_samples": 4, "targeted_move_rate": 0.5},
]


class _SharedCoopChannel:
    """CoopChannel backed by shared-memory int views + a process Lock."""

    def __init__(self, ctrl_view, best_view, K, patience, is_scout, lock, stop_event):
        self._ctrl = ctrl_view
        self._best = best_view
        self.K = K
        self.patience = patience
        self.is_scout = is_scout
        self._lock = lock
        self._stop_event = stop_event

    def best_rows(self):
        return self._ctrl[0]

    def stage_cost(self, n):
        return self._ctrl[COOP_STAGE + n]

    def should_stop(self):
        if self._ctrl[COOP_STOP] != 0:
            return True
        return self._stop_event is not None and self._stop_event.is_set()

    def adopt(self):
        K = self.K
        with self._lock:
            bn = self._ctrl[0]
            best = self._best
            rows = [[best[r * K + k] for k in range(K)] for r in range(bn)]
        return rows if rows else None

    def publish(self, rows, data, stage_iters, from_n):
        K = self.K
        with self._lock:
            ctrl = self._ctrl
            if ctrl[COOP_STAGE + from_n] == 0:
                ctrl[COOP_STAGE + from_n] = min(stage_iters, 0x7FFFFFFF)
            if rows < ctrl[0]:
                best = self._best
                for r in range(rows):
                    row = data[r]
                    off = r * K
                    for k in range(K):
                        best[off + k] = row[k]
                ctrl[0] = rows


def _build_worker_sa(params):
    """Rebuild an SAOptimizer from a clonable param bundle."""
    levels = params["levels"]
    keys = params.get("keys")
    if keys is None:
        keys = list(range(len(levels)))
    values_per_factor = params.get("values_per_factor")
    if values_per_factor is None:
        values_per_factor = [list(range(l)) for l in levels]
    norm_constraints = [_normalize_condition(c) for c in params["constraints"]]
    sa = SAOptimizer(keys, values_per_factor, params["int_rows"],
                     params["strength"], norm_constraints, {}, params["seed"])
    sa.min_collateral_samples = max(1, int(params.get("min_collateral_samples", 1)))
    return sa


def _coop_worker(shm_ctrl_name, shm_best_name, ctrl_len, best_len, params,
                 K, patience, is_scout, lock, stop_event, progress_queue):
    """Worker process entry: attach shared blackboard and run cooperatively.

    Only the creating (main) process unlinks the shared memory; workers merely
    attach and close, so lifetime management stays in one place.
    """
    from multiprocessing import shared_memory

    shm_ctrl = shared_memory.SharedMemory(name=shm_ctrl_name)
    shm_best = shared_memory.SharedMemory(name=shm_best_name)
    ctrl_view = memoryview(shm_ctrl.buf)[: ctrl_len * 4].cast("i")
    best_view = memoryview(shm_best.buf)[: best_len * 4].cast("i")
    try:
        ch = _SharedCoopChannel(ctrl_view, best_view, K, patience, is_scout,
                                lock, stop_event)
        sa = _build_worker_sa(params)

        def on_crack(rows, elapsed_ms):
            if progress_queue is not None:
                try:
                    progress_queue.put_nowait((rows, elapsed_ms))
                except Exception:
                    # Progress is best-effort: drop this update if the queue is
                    # full or already closed rather than stalling the worker.
                    pass

        sa.reduce_cooperative(
            params["int_rows"], params["budget_ms"], params["initial_iterations"],
            params["iteration_growth"], params["start_temperature"],
            params["end_temperature"], params["targeted_move_rate"], ch, on_crack,
        )
    finally:
        ctrl_view.release()
        best_view.release()
        shm_ctrl.close()
        shm_best.close()


def _run_cooperative(base, variants, max_n, K, patience, int_rows,
                     on_progress, cancel):
    """Run the cooperative portfolio on worker processes over shared memory.

    Returns the final global-best array, or raises on setup failure (the caller
    then falls back to a single process).
    """
    import threading
    from multiprocessing import get_context, shared_memory

    ctx = get_context("spawn")

    ctrl_len = 3 + max_n + 1
    best_len = max_n * K
    shm_ctrl = shared_memory.SharedMemory(create=True, size=ctrl_len * 4)
    shm_best = shared_memory.SharedMemory(create=True, size=best_len * 4)

    lock = ctx.Lock()
    stop_event = ctx.Event()
    progress_queue = ctx.Queue() if on_progress is not None else None

    procs = []
    ctrl_view = None
    best_view = None
    try:
        ctrl_view = memoryview(shm_ctrl.buf)[: ctrl_len * 4].cast("i")
        best_view = memoryview(shm_best.buf)[: best_len * 4].cast("i")
        for i in range(ctrl_len):
            ctrl_view[i] = 0
        ctrl_view[0] = max_n  # best starts as the (unreduced) input
        for r in range(max_n):
            off = r * K
            row = int_rows[r]
            for k in range(K):
                best_view[off + k] = row[k]

        # background thread that raises the shared stop flag on cancel
        cancel_watch = None
        watch_stop = threading.Event()
        if cancel is not None:
            def _watch():
                while not watch_stop.is_set():
                    if cancel.is_set():
                        ctrl_view[COOP_STOP] = 1
                        stop_event.set()
                        return
                    watch_stop.wait(0.02)
            cancel_watch = threading.Thread(target=_watch, daemon=True)
            cancel_watch.start()

        # background thread draining worker progress into on_progress
        prog_thread = None
        global_best = [float("inf")]
        if progress_queue is not None:
            def _drain():
                while True:
                    item = progress_queue.get()
                    if item is None:
                        return
                    rows, elapsed_ms = item
                    if rows < global_best[0]:
                        global_best[0] = rows
                        on_progress({"rows": rows, "elapsed_ms": elapsed_ms})
            prog_thread = threading.Thread(target=_drain, daemon=True)
            prog_thread.start()

        for v in variants:
            params = dict(base)
            params["seed"] = v["seed"]
            params["min_collateral_samples"] = v["min_collateral_samples"]
            params["targeted_move_rate"] = v["targeted_move_rate"]
            p = ctx.Process(
                target=_coop_worker,
                args=(shm_ctrl.name, shm_best.name, ctrl_len, best_len, params,
                      K, patience, v.get("is_scout", False), lock, stop_event,
                      progress_queue),
            )
            p.start()
            procs.append(p)

        for p in procs:
            p.join()

        # if every worker crashed (nonzero exit) nothing was published; signal
        # failure so the caller falls back to a single in-process run
        if procs and all(p.exitcode not in (0, None) for p in procs):
            raise RuntimeError("all cooperative workers failed")

        # tell the progress drainer to stop and wait briefly
        watch_stop.set()
        if progress_queue is not None:
            progress_queue.put(None)
            if prog_thread is not None:
                prog_thread.join(timeout=1.0)

        bn = ctrl_view[0]
        out = [[best_view[r * K + k] for k in range(K)] for r in range(bn)]
        return out
    finally:
        for p in procs:
            if p.is_alive():
                p.terminate()
        # memoryviews must be released before the shared memory can close
        if ctrl_view is not None:
            ctrl_view.release()
        if best_view is not None:
            best_view.release()
        shm_ctrl.close()
        shm_ctrl.unlink()
        shm_best.close()
        shm_best.unlink()
        if progress_queue is not None:
            progress_queue.close()


def optimize_parallel(ctrl, rows, tuning=None):
    """Parallel variant of :func:`optimize` (cooperative island model).

    Runs a portfolio of strategies x seeds on worker processes sharing a
    global-best array; laggards adopt the shared best while scouts keep
    exploring. The smallest verified result is returned. Falls back to a single
    process when ``workers <= 1``, when the run uses a custom ``comparer`` /
    ``fn`` constraint (not picklable), or when the parallel backend fails.
    """
    t = _resolve_tuning(tuning)
    strength, constraints, comparer = _controller_config(ctrl)
    keys, values_per_factor, K, int_rows, decode = prepare_optimize(rows, ctrl.factors)

    if len(int_rows) <= 1 or K < strength:
        return [decode(r) for r in int_rows]

    norm_constraints = [_normalize_condition(c) for c in constraints]
    # main-process optimizer: single-thread path + the independent safety valve
    sa = SAOptimizer(keys, values_per_factor, int_rows, strength,
                     norm_constraints, comparer, t["seed"])
    sa.min_collateral_samples = max(1, int(t["min_collateral_samples"]))
    sa.cancel = t["cancel"]

    want_workers = max(1, int(t["workers"]))
    can_parallel = want_workers > 1 and not _uses_functions(comparer, constraints)

    best_data = None
    if can_parallel:
        levels = [len(v) for v in values_per_factor]
        has_constraints = len(constraints) > 0
        base = {
            "levels": levels,
            "keys": keys if has_constraints else None,
            "values_per_factor": values_per_factor if has_constraints else None,
            "int_rows": int_rows,
            "strength": strength,
            "constraints": norm_constraints,
            "budget_ms": t["budget_ms"],
            "initial_iterations": t["initial_iterations"],
            "iteration_growth": t["iteration_growth"],
            "start_temperature": t["start_temperature"],
            "end_temperature": t["end_temperature"],
            "targeted_move_rate": t["targeted_move_rate"],
        }
        num_scouts = 2 if want_workers >= 4 else (1 if want_workers >= 2 else 0)
        variants = []
        for i in range(want_workers):
            portfolio = _DEFAULT_PORTFOLIO[i % len(_DEFAULT_PORTFOLIO)]
            variants.append({
                "seed": (t["seed"] + i) & 0xFFFFFFFF,
                "min_collateral_samples": portfolio["min_collateral_samples"],
                "targeted_move_rate": portfolio["targeted_move_rate"],
                "is_scout": i < num_scouts,
            })
        try:
            best_data = _run_cooperative(
                base, variants, len(int_rows), K, 3, int_rows,
                t["on_progress"], t["cancel"],
            )
        except Exception:
            best_data = None

    if best_data is None:
        best_data = sa.reduce(
            int_rows, t["budget_ms"], t["initial_iterations"], t["iteration_growth"],
            t["start_temperature"], t["end_temperature"], t["targeted_move_rate"],
            t["on_progress"],
        )

    chosen = best_data if sa.verify(best_data) else int_rows
    return [decode(r) for r in chosen]
