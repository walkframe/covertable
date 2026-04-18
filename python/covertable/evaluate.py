"""Three-valued (Kleene) constraint evaluation engine.

Condition types (plain dicts with an ``operator`` key):

Comparison:
    {"operator": "eq"|"ne"|"gt"|"lt"|"gte"|"lte", "left": Operand, "value": any}
    {"operator": "eq"|"ne"|"gt"|"lt"|"gte"|"lte", "left": Operand, "right": Operand}
    {"operator": "in", "left": Operand, "values": list}

Logical:
    {"operator": "not", "condition": Condition}
    {"operator": "and", "conditions": [Condition, ...]}
    {"operator": "or",  "conditions": [Condition, ...]}

Arithmetic (used as Operand, not as top-level Condition):
    {"operator": "add"|"sub"|"mul"|"div"|"mod", "left": Operand, "right": Operand}
    {"operator": "add"|"sub"|"mul"|"div"|"mod", "left": Operand, "value": any}

Function (escape hatch):
    {"operator": "fn", "requires": [str, ...], "evaluate": callable(row)->bool}

An Operand is either a string (field reference, dot notation supported) or
an arithmetic expression dict.

``evaluate()`` returns ``True``, ``False``, or ``None`` (unknown/deferred).
"""

_SENTINEL = object()

DEFAULT_COMPARER = {
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
    "gt": lambda a, b: a > b,
    "lt": lambda a, b: a < b,
    "gte": lambda a, b: a >= b,
    "lte": lambda a, b: a <= b,
    "in": lambda value, values: value in values,
}

_ARITHMETIC_OPS = {
    "add": lambda a, b: a + b,
    "sub": lambda a, b: a - b,
    "mul": lambda a, b: a * b,
    "div": lambda a, b: a / b,
    "mod": lambda a, b: a % b,
    "pow": lambda a, b: a ** b,
}


def resolve(row, field):
    """Resolve a field path against a row dict.

    String fields support dot notation for nested access.
    Returns ``_SENTINEL`` if any segment is missing.
    """
    if not isinstance(field, str):
        return row.get(field, _SENTINEL)
    parts = field.split(".")
    current = row
    for part in parts:
        if current is None or not isinstance(current, dict):
            return _SENTINEL
        current = current.get(part, _SENTINEL)
        if current is _SENTINEL:
            return _SENTINEL
    return current


def resolve_operand(row, operand):
    """Resolve an operand (field reference or arithmetic expression).

    Returns ``_SENTINEL`` if any referenced field is missing.
    """
    if isinstance(operand, (str, int)):
        return resolve(row, operand)
    # Arithmetic expression dict
    left = resolve_operand(row, operand["left"])
    if left is _SENTINEL:
        return _SENTINEL
    if "right" in operand:
        right = resolve_operand(row, operand["right"])
    else:
        right = operand["value"]
    if right is _SENTINEL:
        return _SENTINEL
    fn = _ARITHMETIC_OPS[operand["operator"]]
    return fn(left, right)


def _extract_operand_keys(operand):
    """Extract top-level factor keys from an operand."""
    if isinstance(operand, str):
        return {operand.split(".")[0]}
    if isinstance(operand, int):
        return {operand}
    # Arithmetic expression
    keys = _extract_operand_keys(operand["left"])
    if "right" in operand:
        keys.update(_extract_operand_keys(operand["right"]))
    return keys


def extract_keys(condition):
    """Return the set of top-level factor keys a condition depends on."""
    op = condition["operator"]
    if op == "not":
        return extract_keys(condition["condition"])
    if op in ("and", "or"):
        keys = set()
        for sub in condition["conditions"]:
            keys.update(extract_keys(sub))
        return keys
    if op == "fn":
        return set(condition["requires"])
    # comparison / in
    keys = _extract_operand_keys(condition["left"])
    right = condition.get("right")
    if right is not None:
        keys.update(_extract_operand_keys(right))
    return keys


def evaluate(condition, row, comparer=None):
    """Evaluate *condition* against *row* under Kleene three-valued logic.

    Returns ``True`` (satisfied), ``False`` (violated), or ``None`` (unknown).
    """
    if comparer is None:
        comparer = {}
    op = condition["operator"]

    # -- logical --
    if op == "not":
        r = evaluate(condition["condition"], row, comparer)
        if r is None:
            return None
        return not r

    if op == "and":
        has_unknown = False
        for sub in condition["conditions"]:
            r = evaluate(sub, row, comparer)
            if r is False:
                return False
            if r is None:
                has_unknown = True
        return None if has_unknown else True

    if op == "or":
        has_unknown = False
        for sub in condition["conditions"]:
            r = evaluate(sub, row, comparer)
            if r is True:
                return True
            if r is None:
                has_unknown = True
        return None if has_unknown else False

    # -- custom --
    if op == "fn":
        for k in condition["requires"]:
            if resolve(row, k) is _SENTINEL:
                return None
        return condition["evaluate"](row)

    # -- in --
    if op == "in":
        v = resolve_operand(row, condition["left"])
        if v is _SENTINEL:
            return None
        fn = comparer.get("in", DEFAULT_COMPARER["in"])
        return fn(v, condition["values"])

    # -- comparison --
    v = resolve_operand(row, condition["left"])
    if v is _SENTINEL:
        return None

    right = condition.get("right")
    if right is not None:
        t = resolve_operand(row, right)
        if t is _SENTINEL:
            return None
    else:
        t = condition["value"]

    fn = comparer.get(op, DEFAULT_COMPARER[op])
    return fn(v, t)
