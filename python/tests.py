import random
from itertools import product, combinations

import pytest


def call(
    factors,
    strength,
    sorter="hash",
    criterion="greedy",
    options={},
    constraints=None,
):
    from covertable import make, sorters, criteria

    return make(
        factors=factors,
        strength=strength,
        sorter=getattr(sorters, sorter),
        criterion=getattr(criteria, criterion),
        options=options,
        progress=True,
        constraints=constraints,
    )


class Test_covertable:
    def _get_pairs(self, factors, strength=2):
        from covertable.lib import get_items

        all_keys = [k for k, _ in get_items(factors)]
        for keys in combinations(all_keys, strength):
            factors_list = [factors[keys[i]] for i in range(strength)]
            for pair in product(*factors_list):
                yield pair

    @pytest.mark.parametrize("strength", [2, 3, 4])
    def test_all_pairs_must_be_in_rows(self, strength):
        factors = [
            ["a", "b", "c"],
            ["d", "e"],
            ["f"],
            ["g", "h"],
            ["i", "j"],
            ["k", "l", "m", "n"],
        ]
        rows = call(factors, strength)
        for pair in self._get_pairs(factors, strength):
            for row in rows:
                if all(p in row for p in pair):
                    break
            else:
                assert False, f"{pair} is not in any rows."

    def test_constraints_exclude_specified_pairs(self):
        factors = [["a", "b", "c"], ["d", "e"], ["f"]]

        rows = call(
            factors,
            strength=2,
            constraints=[
                {"operator": "custom", "keys": [0, 1], "evaluate":
                    lambda row: not (row[0] == "a" and row[1] == "d")},
                {"operator": "custom", "keys": [0, 1], "evaluate":
                    lambda row: not (row[0] == "b" and row[1] == "e")},
            ],
        )
        unexpected_pairs = [("a", "d"), ("b", "e")]
        for pair in unexpected_pairs:
            for row in rows:
                assert not all(p in row for p in pair), f"{pair} is in a row: {row}"

    def test_constraints_never_matching_makes_no_rows(self):
        factors = [["a", "b", "c"], ["d", "e"], ["f"]]

        rows = call(
            factors,
            strength=2,
            constraints=[
                {"operator": "custom", "keys": [2], "evaluate":
                    lambda row: row[2] != "f"},
            ],
        )
        assert not rows

    def test_greedy_sorter_should_make_rows_less_than_hashs_one_with2(self):
        factors = [
            ["a", "b", "c"],
            ["d", "e", "f"],
            ["g", "h", "i"],
            ["j", "k", "l"],
            ["m", "n", "o"],
            ["p", "q", "r"],
        ]
        len1, len2 = 0, 0
        for _ in range(0, 10):
            options = {"salt": random.randint(0, 100000)}
            rows1 = call(
                factors, strength=2, sorter="hash", criterion="greedy", options=options
            )
            rows2 = call(
                factors, strength=2, sorter="hash", criterion="simple", options=options
            )
            len1 += len(rows1)
            len2 += len(rows2)
        assert len1 < len2

    def test_greedy_sorter_should_make_rows_less_than_hashs_one_with3(self):
        factors = [
            ["a", "b", "c"],
            ["d", "e", "f"],
            ["g", "h", "i"],
            ["j", "k", "l"],
            ["m", "n", "o"],
        ]
        len1, len2 = 0, 0
        for _ in range(0, 10):
            options = {"salt": random.randint(0, 100000)}
            rows1 = call(
                factors, strength=3, sorter="hash", criterion="greedy", options=options
            )
            rows2 = call(
                factors, strength=3, sorter="hash", criterion="simple", options=options
            )
            len1 += len(rows1)
            len2 += len(rows2)
        assert len1 < len2

    def test_random_sorter_makes_different_rows_everytime(self):
        factors = [
            ["a", "b", "c"],
            ["d", "e", "f"],
            ["g", "h", "i"],
            ["j", "k", "l"],
            ["m", "n", "o"],
        ]
        for seed in range(0, 5):
            rows1 = call(factors, strength=2, sorter="random")
            rows2 = call(factors, strength=2, sorter="random")
            assert rows1 != rows2

    def test_invalid_type_factors_raise_an_exception(self):
        factors = [["a", "b", "c"], ["d", "e"], ["f"]]

        with pytest.raises(TypeError):
            call(iter(factors), strength=2)

    def test_presets_full_row_is_included(self):
        from covertable import make
        factors = {"A": ["a1", "a2"], "B": ["b1", "b2"], "C": ["c1", "c2"]}
        rows = make(factors, presets=[{"A": "a1", "B": "b1", "C": "c1"}])
        assert any(r["A"] == "a1" and r["B"] == "b1" and r["C"] == "c1" for r in rows)

    def test_presets_partial_row_is_completed(self):
        from covertable import make
        factors = {"A": ["a1", "a2"], "B": ["b1", "b2"]}
        rows = make(factors, presets=[{"A": "a1"}])
        assert rows[0]["A"] == "a1"
        assert "B" in rows[0]

    def test_presets_violating_constraint_are_dropped(self):
        from covertable import make
        factors = {"OS": ["iOS", "Android"], "Browser": ["Safari", "Chrome"]}

        rows = make(
            factors,
            constraints=[
                {"operator": "custom", "keys": ["OS", "Browser"], "evaluate":
                    lambda row: not (row["OS"] == "iOS" and row["Browser"] == "Chrome")},
            ],
            presets=[
                {"OS": "iOS", "Browser": "Chrome"},  # rejected
                {"OS": "Android", "Browser": "Safari"},  # accepted
            ],
        )
        assert not any(r["OS"] == "iOS" and r["Browser"] == "Chrome" for r in rows)
        assert any(r["OS"] == "Android" and r["Browser"] == "Safari" for r in rows)

    def test_presets_unknown_values_are_ignored(self):
        from covertable import make
        factors = {"A": ["a1", "a2"], "B": ["b1", "b2"]}
        rows = make(factors, presets=[{"A": "unknown", "B": "b1"}])
        # Coverage of known values should still be satisfied
        for a in ["a1", "a2"]:
            for b in ["b1", "b2"]:
                assert any(r["A"] == a and r["B"] == b for r in rows)

    def test_weights_via_options(self):
        from covertable import make
        factors = {
            "A": ["a1", "a2", "a3"],
            "B": ["b1", "b2", "b3"],
            "C": ["c1", "c2", "c3"],
        }
        rows_no_weight = make(factors, salt=1)
        rows_with_weight = make(factors, salt=1, weights={"C": {0: 100}})
        c1_no = sum(1 for r in rows_no_weight if r["C"] == "c1")
        c1_with = sum(1 for r in rows_with_weight if r["C"] == "c1")
        assert c1_with >= c1_no

    def test_dict_type_factors_make_dict_row(self):
        factors = {
            "key1": ["a", "b", "c"],
            "key2": ["d", "e", "f"],
            "key3": ["g", "h", "i"],
            "key4": ["j", "k", "l"],
            "key5": ["m", "n", "o"],
        }
        rows = call(factors, strength=2)
        for row in rows:
            assert sorted(row.keys()) == sorted(factors.keys())
