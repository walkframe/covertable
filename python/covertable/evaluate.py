"""Three-valued (Kleene) constraint evaluation engine.

Condition types (plain dicts with an ``operator`` key):

Comparison:
    {"operator": "eq"|"ne"|"gt"|"lt"|"gte"|"lte", "field": str, "value": any}
    {"operator": "eq"|"ne"|"gt"|"lt"|"gte"|"lte", "field": str, "target": str}
    {"operator": "in", "field": str, "values": list}

Logical:
    {"operator": "not", "condition": Condition}
    {"operator": "and", "conditions": [Condition, ...]}
    {"operator": "or",  "conditions": [Condition, ...]}

Custom (escape hatch):
    {"operator": "custom", "keys": [str, ...], "evaluate": callable(row)->bool}

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
    if op == "custom":
        return set(condition["keys"])
    # comparison / in
    keys = {condition["field"].split(".")[0]}
    target = condition.get("target")
    if isinstance(target, str):
        keys.add(target.split(".")[0])
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
    if op == "custom":
        for k in condition["keys"]:
            if resolve(row, k) is _SENTINEL:
                return None
        return condition["evaluate"](row)

    # -- in --
    if op == "in":
        v = resolve(row, condition["field"])
        if v is _SENTINEL:
            return None
        fn = comparer.get("in", DEFAULT_COMPARER["in"])
        return fn(v, condition["values"])

    # -- comparison --
    v = resolve(row, condition["field"])
    if v is _SENTINEL:
        return None

    target = condition.get("target")
    if target is not None:
        t = resolve(row, target)
        if t is _SENTINEL:
            return None
    else:
        t = condition["value"]

    fn = comparer.get(op, DEFAULT_COMPARER[op])
    return fn(v, t)
