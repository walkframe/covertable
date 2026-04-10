"""Tokenize and compile PICT constraint expressions into row-filter callables."""
import re


# Token types
_REF = "REF"
_STRING = "STRING"
_NUMBER = "NUMBER"
_BOOLEAN = "BOOLEAN"
_NULL = "NULL"
_IF = "IF"
_ELSE = "ELSE"
_THEN = "THEN"
_COMPARER = "COMPARER"
_OPERATOR = "OPERATOR"
_LPAREN = "LPAREN"
_RPAREN = "RPAREN"
_LBRACE = "LBRACE"
_RBRACE = "RBRACE"
_COMMA = "COMMA"
_COLON = "COLON"
_SEMICOLON = "SEMICOLON"
_WHITESPACE = "WHITESPACE"
_UNKNOWN = "UNKNOWN"


def _classify_token(token):
    if token.startswith("[") and token.endswith("]"):
        return {"type": _REF, "value": token}
    if token.startswith('"') and token.endswith('"'):
        return {"type": _STRING, "value": token}
    try:
        float(token)
        return {"type": _NUMBER, "value": token}
    except ValueError:
        pass
    upper = token.upper()
    if upper in ("TRUE", "FALSE"):
        return {"type": _BOOLEAN, "value": upper}
    if upper == "NULL":
        return {"type": _NULL, "value": upper}
    if upper in (_IF, _ELSE, _THEN):
        return {"type": upper, "value": upper}
    if upper in ("=", "<>", ">", "<", ">=", "<=", "IN", "LIKE"):
        return {"type": _COMPARER, "value": upper}
    if upper in ("AND", "OR", "NOT"):
        return {"type": _OPERATOR, "value": upper}
    if token == "(":
        return {"type": _LPAREN, "value": token}
    if token == ")":
        return {"type": _RPAREN, "value": token}
    if token == "{":
        return {"type": _LBRACE, "value": token}
    if token == "}":
        return {"type": _RBRACE, "value": token}
    if token == ",":
        return {"type": _COMMA, "value": token}
    if token == ":":
        return {"type": _COLON, "value": token}
    if token == ";":
        return {"type": _SEMICOLON, "value": token}
    return {"type": _UNKNOWN, "value": token}


def _is_white_space(ch):
    return ch in (" ", "\n", "\t")


class PictConstraintsLexer:
    """Tokenize and compile a PICT constraints text into row-filter callables."""

    def __init__(self, input_str, debug=False, aliases=None, case_insensitive=False):
        self._input = input_str
        self._debug = debug
        self._aliases = aliases or {}
        self._case_insensitive = case_insensitive
        self._tokens = []
        self.filters = []
        self.filter_keys = []
        self.errors = []
        try:
            self._tokenize()
        except Exception as e:
            if self._debug:
                print("Tokenize error:", str(e))
            self.errors.append(str(e))
            return
        self._analyze()

    # -- tokenizer --

    def _tokenize(self):
        constraints = self._input
        tokens = []
        buffer = ""
        inside_quotes = False
        inside_braces = False
        inside_brackets = False

        i = 0
        n = len(constraints)
        while i < n:
            ch = constraints[i]

            if ch == '"':
                inside_quotes = not inside_quotes
                buffer += ch
                if not inside_quotes:
                    tokens.append({"type": _STRING, "value": buffer})
                    buffer = ""
            elif inside_quotes:
                buffer += ch
            elif ch == "[":
                if buffer:
                    tokens.append(_classify_token(buffer))
                    buffer = ""
                inside_brackets = True
                buffer += ch
            elif ch == "]" and inside_brackets:
                buffer += ch
                tokens.append(_classify_token(buffer))
                inside_brackets = False
                buffer = ""
            elif ch == "{":
                inside_braces = True
                if buffer:
                    tokens.append(_classify_token(buffer))
                    buffer = ""
                tokens.append({"type": _LBRACE, "value": ch})
            elif ch == "}":
                inside_braces = False
                if buffer:
                    tokens.append(_classify_token(buffer))
                    buffer = ""
                tokens.append({"type": _RBRACE, "value": ch})
            elif ch == "," and inside_braces:
                if buffer:
                    tokens.append(_classify_token(buffer))
                    buffer = ""
                tokens.append({"type": _COMMA, "value": ch})
            elif ch in "[]=<>!();:" and not inside_braces and not inside_brackets:
                if buffer:
                    tokens.append(_classify_token(buffer))
                    buffer = ""
                if ch in ("<", ">", "!", "="):
                    next_ch = constraints[i + 1] if i + 1 < n else ""
                    if next_ch == "=":
                        tokens.append(_classify_token(ch + "="))
                        i += 1
                    elif ch == "<" and next_ch == ">":
                        tokens.append(_classify_token("<>"))
                        i += 1
                    else:
                        tokens.append(_classify_token(ch))
                else:
                    tokens.append(_classify_token(ch))
            elif _is_white_space(ch) and not inside_braces and not inside_brackets:
                if buffer:
                    tokens.append(_classify_token(buffer))
                    buffer = ""
                ws = ch
                while i + 1 < n and _is_white_space(constraints[i + 1]):
                    i += 1
                    ws += constraints[i]
                tokens.append({"type": _WHITESPACE, "value": ws})
            elif _is_white_space(ch) and (inside_braces or inside_brackets):
                buffer += ch
            else:
                buffer += ch
            i += 1

        if inside_quotes:
            raise ValueError("Unterminated string literal: {}".format(buffer))
        if inside_brackets:
            raise ValueError("Unterminated field reference: {}".format(buffer))
        if inside_braces:
            raise ValueError('Unterminated set (missing closing "}}")')
        if buffer:
            tokens.append(_classify_token(buffer))
        self._tokens = tokens

    # -- analyzer --

    def _analyze(self):
        tokens = self._tokens
        ci = self._case_insensitive
        aliases = self._aliases

        def norm(v):
            if ci and isinstance(v, str):
                return v.lower()
            return v

        # We use a single-element list for the index so closures can mutate it.
        idx = [0]
        current_keys = [set()]

        def next_token():
            while idx[0] < len(tokens) and tokens[idx[0]]["type"] == _WHITESPACE:
                idx[0] += 1
            if idx[0] < len(tokens):
                t = tokens[idx[0]]
                idx[0] += 1
                return t
            return None

        def parse_expression():
            left = parse_term()
            tok = next_token()
            if tok and tok["type"] == _UNKNOWN:
                raise ValueError("Unexpected token: {}".format(tok["value"]))
            while tok and tok["type"] == _OPERATOR and tok["value"] == "OR":
                l = left
                r = parse_term()
                left = (lambda l, r: lambda row: l(row) or r(row))(l, r)
                tok = next_token()
            idx[0] -= 1
            return left

        def parse_term():
            left = parse_factor()
            tok = next_token()
            if tok and tok["type"] == _UNKNOWN:
                raise ValueError("Unexpected token: {}".format(tok["value"]))
            while tok and tok["type"] == _OPERATOR and tok["value"] == "AND":
                l = left
                r = parse_factor()
                left = (lambda l, r: lambda row: l(row) and r(row))(l, r)
                tok = next_token()
            idx[0] -= 1
            return left

        def parse_factor():
            tok = next_token()
            if tok is not None:
                if tok["type"] == _OPERATOR and tok["value"] == "NOT":
                    operand = parse_factor()
                    return lambda row: not operand(row)
                if tok["type"] == _LPAREN:
                    expr = parse_expression()
                    tok = next_token()
                    if not tok or tok["type"] != _RPAREN:
                        raise ValueError("Expected closing parenthesis")
                    return expr
                if tok["type"] == _BOOLEAN:
                    val = tok["value"].upper() == "TRUE"
                    return lambda row: val
                if tok["type"] == _UNKNOWN:
                    raise ValueError("Unexpected token: {}".format(tok["value"]))
            idx[0] -= 1
            return parse_condition()

        def parse_condition():
            left = parse_operand()
            if left is None:
                raise ValueError('Expected field or value after "IF", "THEN", "ELSE"')
            comparer_token = next_token()
            if comparer_token and comparer_token["type"] in (_NUMBER, _STRING, _BOOLEAN, _NULL):
                raise ValueError(
                    "Expected comparison operator but found value: {}".format(comparer_token["value"])
                )
            if comparer_token and comparer_token["type"] == _THEN:
                raise ValueError("A comparison operator and value are required after the field.")
            if comparer_token and comparer_token["type"] == _OPERATOR:
                raise ValueError(
                    "Expected comparison operator but found operator: {}".format(comparer_token["value"])
                )
            if not comparer_token or comparer_token["type"] != _COMPARER:
                if comparer_token and comparer_token.get("value") == "!=":
                    raise ValueError('"!=" is not supported. Use "<>" for inequality comparison')
                value = comparer_token["value"] if comparer_token else None
                raise ValueError("Unknown comparison operator: {}".format(value))
            comparer = comparer_token["value"]

            if comparer == "IN":
                values = parse_set()
                return lambda row: norm(left(row)) in values
            if comparer == "LIKE":
                right = parse_operand()
                if right is None:
                    raise ValueError("Expected string pattern after LIKE")
                pattern_str = right({})
                if not isinstance(pattern_str, str):
                    raise ValueError("Expected string pattern after LIKE")
                regex_pattern = re.escape(pattern_str)
                # Escape protects * and ? — restore them as wildcards
                regex_pattern = regex_pattern.replace(r"\*", ".*").replace(r"\?", ".")
                flags = re.IGNORECASE if ci else 0
                regex = re.compile("^" + regex_pattern + "$", flags)
                return lambda row: bool(regex.match(str(left(row))))
            right = parse_operand()
            if right is None:
                raise ValueError("Expected field or value")
            if comparer == "=":
                return lambda row: norm(left(row)) == norm(right(row))
            if comparer == "<>":
                return lambda row: norm(left(row)) != norm(right(row))
            if comparer == ">":
                return lambda row: left(row) > right(row)
            if comparer == "<":
                return lambda row: left(row) < right(row)
            if comparer == ">=":
                return lambda row: left(row) >= right(row)
            if comparer == "<=":
                return lambda row: left(row) <= right(row)
            raise ValueError("Unknown comparison operator: {}".format(comparer))

        def parse_set():
            elements = []
            tok = next_token()
            if tok and tok["type"] == _LBRACE:
                tok = next_token()
                while tok and tok["type"] != _RBRACE:
                    if tok["type"] == _STRING:
                        raw = tok["value"][1:-1]
                        lookup = raw.lower() if ci else raw
                        resolved = aliases.get(lookup, raw)
                        elements.append(norm(resolved))
                    elif tok["type"] not in (_COMMA, _WHITESPACE):
                        raise ValueError("Unexpected token in array: {}".format(tok["value"]))
                    tok = next_token()
            else:
                value = tok["value"] if tok else "NULL"
                raise ValueError("Expected '{{' but found {}".format(value))
            if not elements:
                raise ValueError("Empty set in IN clause")
            return set(elements)

        def parse_operand():
            tok = next_token()
            if tok is None:
                return None
            if tok["type"] == _REF:
                key = tok["value"][1:-1]
                current_keys[0].add(key)
                return lambda row: row.get(key) if isinstance(row, dict) else row[key]
            if tok["type"] == _STRING:
                raw = tok["value"][1:-1]
                lookup = raw.lower() if ci else raw
                value = aliases.get(lookup, raw)
                return lambda row: value
            if tok["type"] == _NUMBER:
                value = float(tok["value"])
                if value.is_integer():
                    value = int(value)
                return lambda row: value
            if tok["type"] == _BOOLEAN:
                value = tok["value"] == "TRUE"
                return lambda row: value
            if tok["type"] == _NULL:
                return lambda row: None
            return None

        def abandon():
            while idx[0] < len(tokens) and tokens[idx[0]]["type"] != _SEMICOLON:
                idx[0] += 1

        def close(evaluator, error):
            if evaluator is None:
                if self._debug:
                    print("Error[{}]: {}".format(len(self.errors), error))
                self.filters.append(None)
                self.errors.append(error)
            else:
                if self._debug:
                    print("Filter[{}]: compiled".format(len(self.filters)))
                self.filters.append(evaluator)
                self.errors.append(None)
            self.filter_keys.append(current_keys[0])
            current_keys[0] = set()

        def read():
            try:
                expr = parse_expression()
                return expr
            except Exception as e:
                close(None, str(e))
            # If the conditional expression ends with "ELSE", current index has
            # advanced past the semicolon, so step back one before abandoning.
            idx[0] -= 1
            abandon()
            return None

        while idx[0] < len(tokens) and tokens[idx[0]] is not None:
            tok = next_token()
            if tok is None:
                break
            if tok["type"] == _IF:
                condition = read()
                if condition is None:
                    continue
                then_token = next_token()
                if not then_token or then_token["type"] != _THEN:
                    found = then_token["value"] if then_token else "end of input"
                    close(None, 'Expected "THEN" but found {}'.format(found))
                    abandon()
                    continue
                then_eval = read()
                if then_eval is None:
                    continue

                else_token = next_token()
                else_eval = lambda row: True
                if else_token and else_token["type"] == _ELSE:
                    parsed = read()
                    if parsed is None:
                        continue
                    else_eval = parsed
                else:
                    idx[0] -= 1

                close(
                    (lambda c, t, e: lambda row: t(row) if c(row) else e(row))(
                        condition, then_eval, else_eval
                    ),
                    None,
                )
            elif tok["type"] == _SEMICOLON:
                pass
            elif tok["type"] == _UNKNOWN:
                close(None, "Unknown token: {}".format(tok["value"]))
                abandon()
            else:
                # Unconditional constraint: e.g. [A] <> [B] AND [C] = "x";
                idx[0] -= 1
                expr = read()
                if expr is not None:
                    close(expr, None)

    # -- public --

    def filter(self, row, *additional_filters):
        for f in self.filters:
            if f is None:
                continue
            if not f(row):
                return False
        for f in additional_filters:
            if not f(row):
                return False
        return True
