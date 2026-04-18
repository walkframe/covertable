"""Tests for the PictModel parser ported from the TypeScript version."""

import pytest

from covertable.pict import PictModel, weights_by_value


# ---------------------------------------------------------------------------
# Parameter parsing
# ---------------------------------------------------------------------------

class TestParameters:
    def test_basic_definition(self):
        model = PictModel("""
Type:          Single, Span, Stripe, Mirror, RAID-5
Size:          10, 100, 500, 1000, 5000, 10000, 40000
Format method: Quick, Slow
File system:   FAT, FAT32, NTFS
Cluster size:  512, 1024, 2048, 4096, 8192, 16384, 32768, 65536
Compression:   On, Off
""")
        assert model.parameters == {
            "Type": ["Single", "Span", "Stripe", "Mirror", "RAID-5"],
            "Size": [10, 100, 500, 1000, 5000, 10000, 40000],
            "Format method": ["Quick", "Slow"],
            "File system": ["FAT", "FAT32", "NTFS"],
            "Cluster size": [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
            "Compression": ["On", "Off"],
        }

    def test_skips_empty_lines_and_comments(self):
        model = PictModel("""
# This is a comment
A: 1, 2, 3

# Another comment
B: x, y
""")
        assert model.parameters == {"A": [1, 2, 3], "B": ["x", "y"]}

    def test_quoted_strings_with_commas(self):
        model = PictModel('Msg: "hello, world", "foo, bar", normal')
        assert model.parameters == {"Msg": ["hello, world", "foo, bar", "normal"]}

    def test_negative_prefix(self):
        model = PictModel("Type: Valid, ~Invalid, ~Bad")
        assert model.parameters == {"Type": ["Valid", "Invalid", "Bad"]}

    def test_weight_suffix(self):
        model = PictModel("Size: 10, 100 (10), 500")
        assert model.parameters == {"Size": [10, 100, 500]}

    def test_aliases(self):
        model = PictModel("OS: Windows | Win, Linux | GNU/Linux")
        assert model.parameters == {"OS": ["Windows", "Linux"]}

    def test_parameter_reference(self):
        model = PictModel("A: 1, 2, 3\nB: <A>, 4")
        assert model.parameters == {"A": [1, 2, 3], "B": [1, 2, 3, 4]}

    def test_unknown_reference_collected_as_error(self):
        model = PictModel("A: <Unknown>")
        assert any("Unknown parameter reference" in e for e in model.errors)

    def test_combined_features(self):
        model = PictModel('OS: "Windows 10" | Win10, ~"Bad OS" (5), Linux')
        assert model.parameters == {"OS": ["Windows 10", "Bad OS", "Linux"]}

    def test_no_values_collected_as_error(self):
        model = PictModel("Key:")
        assert any('No values for parameter "Key"' in e for e in model.errors)


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------

class TestConstraints:
    def test_parses_parameters_and_constraints(self):
        model = PictModel("""
Type: Single, Span, Stripe
Size: 10, 100, 500

IF [Type] = "Single" THEN [Size] > 10;
""")
        assert model.parameters == {
            "Type": ["Single", "Span", "Stripe"],
            "Size": [10, 100, 500],
        }
        assert len(model.constraints) == 1
        assert model.errors == []

    def test_filter_checks_constraint(self):
        model = PictModel("""
Type: A, B
Size: 10, 100

IF [Type] = "A" THEN [Size] = 100;
""")
        assert model.filter({"Type": "A", "Size": 100}) is True
        assert model.filter({"Type": "A", "Size": 10}) is False
        assert model.filter({"Type": "B", "Size": 10}) is True

    def test_filter_returns_true_when_no_constraints(self):
        model = PictModel("X: 1, 2\nY: a, b")
        assert model.filter({"X": 1, "Y": "a"}) is True

    def test_make_generates_rows_satisfying_constraints(self):
        model = PictModel("""
Type: A, B
Size: 10, 100
Flag: On, Off

IF [Type] = "A" THEN [Size] = 100;
""")
        rows = model.make()
        for row in rows:
            if row["Type"] == "A":
                assert row["Size"] == 100

    def test_unconditional_constraint(self):
        model = PictModel("""
A: x, y
B: x, y

[A] <> [B];
""")
        assert model.errors == []
        assert model.filter({"A": "x", "B": "y"}) is True
        assert model.filter({"A": "x", "B": "x"}) is False

    def test_unconditional_with_and(self):
        model = PictModel("""
A: x, y
B: x, y
C: yes, no

[A] <> [B] AND [C] = "yes";
""")
        assert model.filter({"A": "x", "B": "y", "C": "yes"}) is True
        assert model.filter({"A": "x", "B": "x", "C": "yes"}) is False
        assert model.filter({"A": "x", "B": "y", "C": "no"}) is False


# ---------------------------------------------------------------------------
# Aliases
# ---------------------------------------------------------------------------

class TestAliases:
    def test_alias_resolves_to_canonical(self):
        model = PictModel("""
OS: Windows | Win, Linux
Browser: Chrome, Firefox

IF [OS] = "Win" THEN [Browser] = "Chrome";
""")
        assert model.errors == []
        assert model.filter({"OS": "Windows", "Browser": "Chrome"}) is True
        assert model.filter({"OS": "Windows", "Browser": "Firefox"}) is False
        assert model.filter({"OS": "Linux", "Browser": "Firefox"}) is True

    def test_alias_in_in_clause(self):
        model = PictModel("""
OS: "Windows 10" | Win10, "Mac OS" | Mac, Linux
Result: pass, fail

IF [OS] IN {"Win10", "Mac"} THEN [Result] = "pass";
""")
        assert model.errors == []
        assert model.filter({"OS": "Windows 10", "Result": "pass"}) is True
        assert model.filter({"OS": "Windows 10", "Result": "fail"}) is False
        assert model.filter({"OS": "Mac OS", "Result": "pass"}) is True
        assert model.filter({"OS": "Linux", "Result": "fail"}) is True


# ---------------------------------------------------------------------------
# Invalid values (~)
# ---------------------------------------------------------------------------

class TestInvalidValues:
    def test_records_invalid_values(self):
        model = PictModel("""
Age:  20, 30, ~-1, ~999
Country: Japan, USA, ~"Mars"
""")
        assert model.errors == []
        assert model.invalids["Age"] == {-1, 999}
        assert model.invalids["Country"] == {"Mars"}

    def test_filter_allows_zero_invalid_values(self):
        model = PictModel("Age: 20, ~-1\nCountry: Japan, ~\"Mars\"")
        assert model.filter({"Age": 20, "Country": "Japan"}) is True

    def test_filter_allows_one_invalid_value(self):
        model = PictModel("Age: 20, ~-1\nCountry: Japan, ~\"Mars\"")
        assert model.filter({"Age": -1, "Country": "Japan"}) is True
        assert model.filter({"Age": 20, "Country": "Mars"}) is True

    def test_filter_rejects_two_invalid_values(self):
        model = PictModel("Age: 20, ~-1\nCountry: Japan, ~\"Mars\"")
        assert model.filter({"Age": -1, "Country": "Mars"}) is False

    def test_make_never_combines_two_invalid_values(self):
        model = PictModel("""
Age: 20, 30, ~-1, ~999
Country: Japan, USA, ~"Mars"
""")
        rows = model.make()
        for row in rows:
            age_invalid = row["Age"] in (-1, 999)
            country_invalid = row["Country"] == "Mars"
            assert not (age_invalid and country_invalid)


# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------

class TestSubModels:
    def test_parses_sub_model_definition(self):
        model = PictModel("""
A: 1, 2, 3
B: 4, 5, 6
C: 7, 8, 9

{ A, B, C } @ 3
""")
        assert model.sub_models == [{"fields": ["A", "B", "C"], "strength": 3}]
        assert model.errors == []

    def test_sub_model_increases_coverage(self):
        model = PictModel("""
A: a1, a2, a3
B: b1, b2, b3
C: c1, c2, c3
D: d1, d2

{ A, B, C } @ 3
""")
        rows = model.make()
        for a in ["a1", "a2", "a3"]:
            for b in ["b1", "b2", "b3"]:
                for c in ["c1", "c2", "c3"]:
                    found = any(r["A"] == a and r["B"] == b and r["C"] == c for r in rows)
                    assert found, "missing combination ({}, {}, {})".format(a, b, c)


# ---------------------------------------------------------------------------
# Weights
# ---------------------------------------------------------------------------

class TestWeights:
    def test_parses_weight_syntax(self):
        model = PictModel("Browser: Chrome (10), Firefox, Safari (5)")
        assert model.errors == []
        assert model.weights == {"Browser": {0: 10, 2: 5}}

    def test_no_weights_when_none_specified(self):
        model = PictModel("Browser: Chrome, Firefox")
        assert model.weights == {}

    def test_weighted_value_is_preferred(self):
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


class TestWeightsByValue:
    def test_basic_conversion(self):
        result = weights_by_value(
            {"Browser": ["Chrome", "Firefox", "Safari"]},
            {"Browser": {"Chrome": 10, "Safari": 5}},
        )
        assert result == {"Browser": {0: 10, 2: 5}}

    def test_skips_unknown_keys(self):
        result = weights_by_value(
            {"A": ["x", "y"]},
            {"A": {"x": 10}, "Unknown": {"foo": 5}},
        )
        assert result == {"A": {0: 10}}

    def test_skips_unknown_values(self):
        result = weights_by_value(
            {"A": ["x", "y"]},
            {"A": {"x": 10, "z": 99}},
        )
        assert result == {"A": {0: 10}}

    def test_matches_numeric_via_string(self):
        result = weights_by_value(
            {"Size": [10, 100, 1000]},
            {"Size": {"100": 5}},
        )
        assert result == {"Size": {1: 5}}


# ---------------------------------------------------------------------------
# Case insensitivity
# ---------------------------------------------------------------------------

class TestCaseInsensitive:
    def test_default_case_insensitive(self):
        model = PictModel("""
OS: iOS, Android
Browser: Chrome, Firefox

IF [OS] = "ios" THEN [Browser] = "chrome";
""")
        assert model.filter({"OS": "iOS", "Browser": "Chrome"}) is True
        assert model.filter({"OS": "iOS", "Browser": "Firefox"}) is False

    def test_in_clause(self):
        model = PictModel("""
Color: Red, Blue, Green, Yellow
Category: Primary, Secondary

IF [Color] IN {"red", "blue"} THEN [Category] = "Primary";
""")
        assert model.filter({"Color": "Red", "Category": "Primary"}) is True
        assert model.filter({"Color": "Blue", "Category": "Primary"}) is True
        assert model.filter({"Color": "Green", "Category": "Secondary"}) is True
        assert model.filter({"Color": "Red", "Category": "Secondary"}) is False

    def test_like_clause(self):
        model = PictModel("""
Name: Alice, alice, Bob
Status: Active, Inactive

IF [Name] LIKE "ALIC*" THEN [Status] = "Active";
""")
        assert model.filter({"Name": "Alice", "Status": "Active"}) is True
        assert model.filter({"Name": "alice", "Status": "Active"}) is True
        assert model.filter({"Name": "Alice", "Status": "Inactive"}) is False
        assert model.filter({"Name": "Bob", "Status": "Inactive"}) is True

    def test_explicit_case_sensitive(self):
        model = PictModel(
            """
OS: iOS, Android
Browser: Chrome, Firefox

IF [OS] = "ios" THEN [Browser] = "chrome";
""",
            case_insensitive=False,
        )
        # No row matches "ios" because comparison is case-sensitive
        assert model.filter({"OS": "iOS", "Browser": "Firefox"}) is True


# ---------------------------------------------------------------------------
# Pass-through options
# ---------------------------------------------------------------------------

class TestOptions:
    def test_make_accepts_strength(self):
        model = PictModel("A: 1, 2, 3\nB: a, b, c")
        rows = model.make(strength=2)
        assert len(rows) > 0

    def test_make_accepts_salt(self):
        model = PictModel("A: 1, 2, 3\nB: a, b, c\nC: x, y")
        rows1 = model.make(salt=1)
        rows2 = model.make(salt=2)
        assert len(rows1) > 0
        assert len(rows2) > 0

    def test_make_accepts_presets(self):
        model = PictModel("A: 1, 2\nB: a, b")
        rows = model.make(presets=[{"A": 1, "B": "a"}])
        assert any(r["A"] == 1 and r["B"] == "a" for r in rows)

    def test_make_async_yields_rows(self):
        model = PictModel("A: 1, 2\nB: a, b")
        rows = list(model.make_async())
        assert len(rows) > 0

    def test_user_constraints_combine_with_model_constraints(self):
        model = PictModel("""
OS: iOS, Android
Browser: Chrome, Safari
""")
        rows = model.make(constraints=[
            {"operator": "ne", "left": "OS", "value": "iOS"},
        ])
        for row in rows:
            assert row["OS"] != "iOS"
