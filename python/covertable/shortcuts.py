"""Constraint builder with ``$``-prefixed field references.

Usage::

    from covertable.shortcuts import Constraint

    c = Constraint()

    make(factors, constraints=[
        c.ne("$A", "$B"),
        c.eq("$OS", "Mac"),
        c.gt(c.mul("$Price", "$Qty"), 10000),
        c.lte(c.sum("$A", "$B", "$C"), 100),
        c.or_(c.eq("$OS", "Mac"), c.ne("$Browser", "Safari")),
        c.fn(["OS", "Browser"], lambda row: row["OS"] != row["Browser"]),
    ])
"""


class _Val:
    """Wrapper to force a value to be treated as a literal."""
    __slots__ = ("value",)

    def __init__(self, value):
        self.value = value


def _resolve(x):
    """Resolve a shortcut operand.

    - ``$name`` → field reference (string without ``$``)
    - ``dict`` with ``operator`` → arithmetic expression (pass through)
    - ``_Val`` wrapper → forced literal
    - anything else → literal value
    """
    if isinstance(x, _Val):
        return ("value", x.value)
    if isinstance(x, dict) and "operator" in x:
        return ("operand", x)
    if isinstance(x, str) and x.startswith("$"):
        return ("operand", x[1:])
    return ("value", x)


def _build_comparison(operator, left, right):
    tag_l, val_l = _resolve(left)
    left_op = val_l  # left is always an operand
    tag_r, val_r = _resolve(right)
    if tag_r == "operand":
        return {"operator": operator, "left": left_op, "right": val_r}
    return {"operator": operator, "left": left_op, "value": val_r}


def _build_arithmetic(operator, left, right):
    tag_l, val_l = _resolve(left)
    left_op = val_l
    tag_r, val_r = _resolve(right)
    if tag_r == "operand":
        return {"operator": operator, "left": left_op, "right": val_r}
    return {"operator": operator, "left": left_op, "value": val_r}


def _fold_arithmetic(operator, args):
    acc = _build_arithmetic(operator, args[0], args[1])
    for i in range(2, len(args)):
        tag, val = _resolve(args[i])
        if tag == "operand":
            acc = {"operator": operator, "left": acc, "right": val}
        else:
            acc = {"operator": operator, "left": acc, "value": val}
    return acc


class Constraint:
    """Constraint builder with ``$``-prefixed field references."""

    # -- comparison --

    def eq(self, left, right):
        return _build_comparison("eq", left, right)

    def ne(self, left, right):
        return _build_comparison("ne", left, right)

    def gt(self, left, right):
        return _build_comparison("gt", left, right)

    def lt(self, left, right):
        return _build_comparison("lt", left, right)

    def gte(self, left, right):
        return _build_comparison("gte", left, right)

    def lte(self, left, right):
        return _build_comparison("lte", left, right)

    def in_(self, left, values):
        tag, val = _resolve(left)
        return {"operator": "in", "left": val, "values": values}

    # -- logical --

    def and_(self, *conditions):
        return {"operator": "and", "conditions": list(conditions)}

    def or_(self, *conditions):
        return {"operator": "or", "conditions": list(conditions)}

    def not_(self, condition):
        return {"operator": "not", "condition": condition}

    # -- binary arithmetic --

    def add(self, left, right):
        return _build_arithmetic("add", left, right)

    def sub(self, left, right):
        return _build_arithmetic("sub", left, right)

    def mul(self, left, right):
        return _build_arithmetic("mul", left, right)

    def div(self, left, right):
        return _build_arithmetic("div", left, right)

    def mod(self, left, right):
        return _build_arithmetic("mod", left, right)

    def pow(self, left, right):
        return _build_arithmetic("pow", left, right)

    # -- variadic arithmetic --

    def sum(self, *args):
        if len(args) < 2:
            raise ValueError("sum() requires at least 2 arguments")
        return _fold_arithmetic("add", args)

    def product(self, *args):
        if len(args) < 2:
            raise ValueError("product() requires at least 2 arguments")
        return _fold_arithmetic("mul", args)

    # -- custom --

    def fn(self, requires, evaluate):
        return {"operator": "fn", "requires": requires, "evaluate": evaluate}

    # -- literal --

    def val(self, value):
        """Wrap a value to force it to be treated as a literal, not a field reference."""
        return _Val(value)
