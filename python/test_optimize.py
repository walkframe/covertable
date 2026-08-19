"""Tests for the SA post-processor (covertable.optimize), mirroring the
TypeScript ``optimize.test.ts`` suite. Budgets are kept short so the suite
stays fast; the assertions check invariants (coverage preserved, constraints
held, no growth, reproducibility, no mutation), not absolute row counts.
"""

import json
from itertools import combinations, product

from covertable import make, Controller
from covertable.lib import get_items


# -- helpers ---------------------------------------------------------------


def _keys(factors):
    return [k for k, _ in get_items(factors)]


def _get(row, key):
    return row[key]


def covered_set(rows, factors, strength):
    """Every t-tuple appearing in rows, as a set of stable keys."""
    items = get_items(factors)
    keys = [k for k, _ in items]
    s = set()
    for row in rows:
        for combo in combinations(range(len(keys)), strength):
            parts = tuple((keys[c], _get(row, keys[c])) for c in combo)
            s.add(parts)
    return s


def all_tuples(factors, strength):
    items = get_items(factors)
    keys = [k for k, _ in items]
    for combo in combinations(range(len(keys)), strength):
        lists = [items[c][1] for c in combo]
        for values in product(*lists):
            yield [(keys[combo[i]], values[i]) for i in range(strength)]


def assert_full_coverage(rows, factors, strength):
    for tup in all_tuples(factors, strength):
        found = any(all(_get(row, k) == v for k, v in tup) for row in rows)
        assert found, f"tuple {tup} is not covered"


def assert_preserves(before_rows, after_rows, factors, strength):
    before = covered_set(before_rows, factors, strength)
    after = covered_set(after_rows, factors, strength)
    assert before <= after


# -- correctness -----------------------------------------------------------


class Test_optimize_correctness:
    def test_keeps_coverage_and_never_grows(self):
        factors = {
            "A": ["a1", "a2", "a3"], "B": ["b1", "b2", "b3"],
            "C": ["c1", "c2", "c3"], "D": ["d1", "d2"], "E": ["e1", "e2"],
        }
        rows = make(factors)
        smaller = Controller(factors).optimize(rows, {"budget_ms": 800, "seed": 1})
        assert len(smaller) <= len(rows)
        assert_full_coverage(smaller, factors, 2)

    def test_preserves_exactly_the_input_tuples(self):
        factors = {
            "A": ["a1", "a2", "a3"], "B": ["b1", "b2", "b3"],
            "C": ["c1", "c2"], "D": ["d1", "d2", "d3"],
        }
        rows = make(factors)
        after = Controller(factors).optimize(rows, {"budget_ms": 700, "seed": 7})
        assert_preserves(rows, after, factors, 2)

    def test_array_form_factors_return_array_rows(self):
        factors = [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"], ["j", "k"]]
        rows = make(factors)
        smaller = Controller(factors).optimize(rows, {"budget_ms": 700, "seed": 3})
        assert isinstance(smaller[0], list)
        assert len(smaller) <= len(rows)
        assert_full_coverage(smaller, factors, 2)

    def test_reproducible_for_a_given_seed(self):
        factors = {
            "A": ["a1", "a2", "a3"], "B": ["b1", "b2", "b3"],
            "C": ["c1", "c2", "c3"], "D": ["d1", "d2", "d3"],
        }
        rows = make(factors)
        r1 = Controller(factors).optimize(rows, {"budget_ms": 500, "seed": 42})
        r2 = Controller(factors).optimize(rows, {"budget_ms": 500, "seed": 42})
        assert r1 == r2

    def test_does_not_mutate_input_rows(self):
        factors = {"A": ["a1", "a2", "a3"], "B": ["b1", "b2", "b3"], "C": ["c1", "c2"]}
        rows = make(factors)
        snapshot = json.dumps(rows)
        Controller(factors).optimize(rows, {"budget_ms": 400, "seed": 5})
        assert json.dumps(rows) == snapshot

    def test_handles_trivially_small_inputs(self):
        factors = {"A": ["a1", "a2"], "B": ["b1"]}
        rows = make(factors)
        out = Controller(factors).optimize(rows, {"budget_ms": 200})
        assert_full_coverage(out, factors, 2)
        assert len(out) <= len(rows)


# -- Controller.make() + optimize() integration ---------------------------


class Test_controller_make_optimize:
    def test_optimizes_last_make_output_by_default(self):
        factors = {"A": ["a1", "a2", "a3"], "B": ["b1", "b2", "b3"], "C": ["c1", "c2"]}
        ctrl = Controller(factors)
        plain = ctrl.make()
        optimized = ctrl.optimize(None, {"budget_ms": 500, "seed": 2})
        assert len(optimized) <= len(plain)
        assert_full_coverage(optimized, factors, 2)

    def test_reuses_strength_from_controller(self):
        factors = {
            "A": ["a1", "a2", "a3"], "B": ["b1", "b2", "b3"],
            "C": ["c1", "c2", "c3"], "D": ["d1", "d2"], "E": ["e1", "e2"],
        }
        strength = 3
        ctrl = Controller(factors, strength=strength)
        optimized = ctrl.optimize(ctrl.make(), {"budget_ms": 1200, "seed": 3})
        assert_full_coverage(optimized, factors, strength)


# -- constraints -----------------------------------------------------------


class Test_optimize_with_constraints:
    def test_declarative_constraint_kept_valid_and_coverage_preserved(self):
        factors = {
            "OS": ["Win", "Mac", "Linux"],
            "Browser": ["Chrome", "Firefox", "Safari"],
            "Lang": ["en", "ja", "de"],
        }
        constraints = [{
            "operator": "or",
            "conditions": [
                {"operator": "ne", "left": "Browser", "value": "Safari"},
                {"operator": "eq", "left": "OS", "value": "Mac"},
            ],
        }]
        rows = make(factors, constraints=constraints)
        smaller = Controller(factors, constraints=constraints).optimize(
            rows, {"budget_ms": 900, "seed": 11})
        assert len(smaller) <= len(rows)
        for row in smaller:
            if row["Browser"] == "Safari":
                assert row["OS"] == "Mac"
        assert_preserves(rows, smaller, factors, 2)

    def test_fn_constraint_kept_valid(self):
        factors = {"A": [1, 2, 3, 4], "B": [10, 20, 30, 40], "C": ["x", "y"]}
        constraints = [{
            "operator": "fn", "requires": ["A", "B"],
            "evaluate": lambda row: row["A"] + row["B"] / 10 != 5,
        }]
        rows = make(factors, constraints=constraints)
        smaller = Controller(factors, constraints=constraints).optimize(
            rows, {"budget_ms": 900, "seed": 13})
        for row in smaller:
            assert row["A"] + row["B"] / 10 != 5
        assert_preserves(rows, smaller, factors, 2)


# -- parallel --------------------------------------------------------------


class Test_optimize_parallel:
    def test_parallel_reduces_and_stays_covered(self):
        factors = {f"f{k}": [f"v{v}" for v in range(3)] for k in range(9)}  # 3^9
        rows = make(factors)
        smaller = Controller(factors).optimize_parallel(
            rows, {"budget_ms": 1500, "seed": 1, "workers": 4})
        assert len(smaller) <= len(rows)
        assert_full_coverage(smaller, factors, 2)

    def test_parallel_falls_back_to_single_process_for_fn_constraint(self):
        # fn constraints can't cross the process boundary -> single-process path
        factors = {"A": [1, 2, 3, 4], "B": [10, 20, 30, 40], "C": ["x", "y"]}
        constraints = [{
            "operator": "fn", "requires": ["A", "B"],
            "evaluate": lambda row: row["A"] + row["B"] / 10 != 5,
        }]
        rows = make(factors, constraints=constraints)
        smaller = Controller(factors, constraints=constraints).optimize_parallel(
            rows, {"budget_ms": 800, "seed": 13, "workers": 4})
        for row in smaller:
            assert row["A"] + row["B"] / 10 != 5
        assert_preserves(rows, smaller, factors, 2)

    def test_camelcase_alias_exists(self):
        factors = {"A": ["a1", "a2"], "B": ["b1", "b2"]}
        ctrl = Controller(factors)
        rows = make(factors)
        assert ctrl.optimizeParallel(rows, {"budget_ms": 200}) is not None
