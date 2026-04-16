"""PictModel: parse a PICT-format model and generate rows from it."""
from ..main import make as _make, make_async as _make_async
from .lexer import PictConstraintsLexer
from .parser import (
    SUB_MODEL_PATTERN,
    is_parameter_line,
    parse_pict_model,
    parse_sub_model,
)


def _split_sections(input_str):
    """Split input into parameter, sub-model, and constraint sections."""
    lines = input_str.split("\n")
    param_lines = []
    sub_model_lines = []
    constraint_start = len(lines)

    for i, line in enumerate(lines):
        trimmed = line.strip()
        if trimmed == "" or trimmed.startswith("#"):
            param_lines.append(line)
            continue
        if is_parameter_line(trimmed):
            param_lines.append(line)
        elif SUB_MODEL_PATTERN.match(trimmed):
            sub_model_lines.append(trimmed)
        else:
            constraint_start = i
            break

    return {
        "parameter_text": "\n".join(param_lines),
        "sub_model_lines": sub_model_lines,
        "constraint_text": "\n".join(lines[constraint_start:]),
    }


class PictModel:
    """Parse a PICT-format model and generate rows from it.

    The input string is split into three sections:

    1. Parameters: ``Name: value1, value2, ...``
    2. Sub-models: ``{ A, B, C } @ N``
    3. Constraints: ``IF [P] = "x" THEN [Q] = "y";`` or ``[P] <> [Q];``

    Errors are collected in :attr:`errors` instead of being raised so that a
    partially-valid model can still be inspected.

    Parameters
    ----------
    input_str : str
        The PICT-format model text.
    case_insensitive : bool, optional
        When ``True`` (default, matching PICT), constraint comparisons and
        alias lookups ignore the case of string values.
    """

    def __init__(self, input_str, case_insensitive=True):
        sections = _split_sections(input_str)
        parsed = parse_pict_model(sections["parameter_text"])

        self._parameters = parsed["factors"]
        self._invalids = parsed["invalids"]
        self._weights = parsed["weights"]
        self.errors = list(parsed["errors"])

        # Normalize alias keys for case-insensitive lookup
        if case_insensitive:
            lexer_aliases = {k.lower(): v for k, v in parsed["aliases"].items()}
        else:
            lexer_aliases = parsed["aliases"]

        self._sub_models = []
        for line in sections["sub_model_lines"]:
            sub = parse_sub_model(line)
            if sub:
                self._sub_models.append(sub)
            else:
                self.errors.append("Invalid sub-model definition: {}".format(line))

        self._lexer = None
        ct = sections["constraint_text"].strip()
        # Filter out comment lines from constraint text
        if ct:
            filtered_lines = []
            for line in ct.split("\n"):
                stripped = line.strip()
                if stripped.startswith("#"):
                    continue
                filtered_lines.append(line)
            ct = "\n".join(filtered_lines)
        if ct.strip():
            self._lexer = PictConstraintsLexer(
                ct,
                debug=False,
                aliases=lexer_aliases,
                case_insensitive=case_insensitive,
            )
            self.errors.extend(e for e in self._lexer.errors if e is not None)

        self._controller = None

    # -- properties --

    @property
    def parameters(self):
        return self._parameters

    @property
    def sub_models(self):
        return self._sub_models

    @property
    def constraints(self):
        return self._lexer.filters if self._lexer else []

    @property
    def invalids(self):
        return self._invalids

    @property
    def weights(self):
        return self._weights

    @property
    def progress(self):
        return self._controller.progress if self._controller else 0

    @property
    def stats(self):
        return self._controller.stats if self._controller else None

    # -- methods --

    def filter(self, row):
        """Return True if the row satisfies all constraints and the
        invalid-value rule (at most one invalid value per row)."""
        if self._invalids:
            invalid_count = 0
            for key, invalid_set in self._invalids.items():
                if row.get(key) in invalid_set:
                    invalid_count += 1
                    if invalid_count > 1:
                        return False
        if not self._lexer:
            return True
        return self._lexer.filter(row)

    def _model_constraints(self):
        """Convert model constraints into Condition dicts for the controller."""
        result = []

        if self._lexer:
            filters = self._lexer.filters
            filter_keys = self._lexer.filter_keys
            for i, f in enumerate(filters):
                if f is None:
                    continue
                result.append({
                    "operator": "custom",
                    "keys": list(filter_keys[i]),
                    "evaluate": f,
                })

        if self._invalids:
            negative_keys = list(self._invalids.keys())
            invalids = self._invalids

            def eval_negatives(row):
                seen = False
                for key, neg_set in invalids.items():
                    val = row.get(key)
                    if val in neg_set:
                        if seen:
                            return False
                        seen = True
                return True

            result.append({
                "operator": "custom",
                "keys": negative_keys,
                "evaluate": eval_negatives,
            })

        return result

    def _build_kwargs(self, kwargs):
        kwargs = dict(kwargs)
        user_constraints = kwargs.pop("constraints", None)
        user_filter = kwargs.pop("pre_filter", None)
        user_sub_models = kwargs.pop("sub_models", None)
        user_weights = kwargs.pop("weights", None)

        # Build constraints list (model + user)
        constraints = list(self._model_constraints())
        if user_constraints:
            constraints.extend(user_constraints)
        if user_filter:
            # Wrap legacy pre_filter as a custom constraint
            constraints.append({
                "operator": "custom",
                "keys": list(self._parameters.keys()),
                "evaluate": user_filter,
            })
        kwargs["constraints"] = constraints

        if user_sub_models is not None:
            kwargs["sub_models"] = user_sub_models
        elif self._sub_models:
            kwargs["sub_models"] = self._sub_models

        if user_weights is not None:
            kwargs["weights"] = user_weights
        elif self._weights:
            kwargs["weights"] = self._weights

        return kwargs

    def _apply_negative_prefix(self, row):
        """Prefix negative values with ``~`` in the output."""
        if not self._invalids:
            return row
        if isinstance(row, list):
            return row
        result = dict(row)
        for key, neg_set in self._invalids.items():
            if result.get(key) in neg_set:
                result[key] = "~{}".format(result[key])
        return result

    def make(self, **kwargs):
        """Generate rows that satisfy this model. Accepts the same keyword
        arguments as :func:`covertable.make`."""
        built = self._build_kwargs(kwargs)
        from ..main import Controller
        self._controller = Controller(self._parameters, **built)
        return [self._apply_negative_prefix(row)
                for row in self._controller.make_async()]

    def make_async(self, **kwargs):
        """Generator version of :meth:`make`."""
        built = self._build_kwargs(kwargs)
        from ..main import Controller
        self._controller = Controller(self._parameters, **built)
        for row in self._controller.make_async():
            yield self._apply_negative_prefix(row)
