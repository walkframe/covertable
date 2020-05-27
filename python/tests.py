import random
from itertools import product, combinations

import pytest


def call(
    factors,
    length,
    sorter="sequential",
    criterion="greedy",
    options={},
    pre_filter=None,
    post_filter=None,
):
    from covertable import make, sorters, criteria

    return make(
        factors=factors,
        length=length,
        sorter=getattr(sorters, sorter),
        criterion=getattr(criteria, criterion),
        options=options,
        progress=True,
        pre_filter=pre_filter,
        post_filter=post_filter,
    )


class Test_covertable:
    def _get_pairs(self, factors, length=2):
        from covertable.main import get_items

        all_keys = [k for k, _ in get_items(factors)]
        for keys in combinations(all_keys, length):
            factors_list = [factors[keys[i]] for i in range(length)]
            for pair in product(*factors_list):
                yield pair

    @pytest.mark.parametrize("length", [2, 3, 4])
    def test_all_pairs_must_be_in_rows(self, length):
        factors = [
            ["a", "b", "c"],
            ["d", "e"],
            ["f"],
            ["g", "h"],
            ["i", "j"],
            ["k", "l", "m", "n"],
        ]
        rows = call(factors, length)
        for pair in self._get_pairs(factors, length):
            for row in rows:
                if all(p in row for p in pair):
                    break
            else:
                assert False, f"{pair} is not in any rows."

    def test_pre_filter_excludes_specified_pairs_before(self):
        factors = [["a", "b", "c"], ["d", "e"], ["f"]]

        def pre_filter(row):
            if row[0] == "a" and row[1] == "d":
                return False
            if row[0] == "b" and row[1] == "e":
                return False
            return True

        rows = call(factors, length=2, pre_filter=pre_filter)
        unexpected_pairs = [("a", "d"), ("b", "e")]
        for pair in unexpected_pairs:
            for row in rows:
                assert not all(p in row for p in pair), f"{pair} is in a row: {row}"

    def test_pre_filter_never_matching_raises_an_exception(self):
        factors = [["a", "b", "c"], ["d", "e"], ["f"]]

        def pre_filter(row):
            if row[2] == "f":
                return False
            return True

        from covertable.exceptions import InvalidCondition

        with pytest.raises(InvalidCondition):
            call(factors, length=2, pre_filter=pre_filter)

    def test_post_filter_never_matching_makes_no_rows(self):
        factors = [["a", "b", "c"], ["d", "e"], ["f"]]

        def post_filter(row):
            if row[2] == "f":
                return False
            return True

        rows = call(factors, length=2, post_filter=post_filter)
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
            options = {"seed": random.randint(0, 100000)}
            rows1 = call(
                factors, length=2, sorter="hash", criterion="greedy", options=options
            )
            rows2 = call(
                factors, length=2, sorter="hash", criterion="simple", options=options
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
            options = {"seed": random.randint(0, 100000)}
            rows1 = call(
                factors, length=3, sorter="hash", criterion="greedy", options=options
            )
            rows2 = call(
                factors, length=3, sorter="hash", criterion="simple", options=options
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
            rows1 = call(factors, length=2, sorter="random")
            rows2 = call(factors, length=2, sorter="random")
            assert rows1 != rows2

    def test_invalid_type_factors_raise_an_exception(self):
        factors = [["a", "b", "c"], ["d", "e"], ["f"]]

        with pytest.raises(TypeError):
            call(iter(factors), length=2)

    def test_dict_type_factors_make_dict_row(self):
        factors = {
            "key1": ["a", "b", "c"],
            "key2": ["d", "e", "f"],
            "key3": ["g", "h", "i"],
            "key4": ["j", "k", "l"],
            "key5": ["m", "n", "o"],
        }
        rows = call(factors, length=2)
        for row in rows:
            assert sorted(row.keys()) == sorted(factors.keys())
