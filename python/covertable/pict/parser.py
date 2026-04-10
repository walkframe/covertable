"""Parameter and sub-model parsing for PICT-format model files."""
import re


def split_values(input_str):
    """Split comma-separated values respecting quoted strings."""
    values = []
    current = ""
    in_quotes = False
    for ch in input_str:
        if ch == '"':
            in_quotes = not in_quotes
            current += ch
        elif ch == "," and not in_quotes:
            if current.strip():
                values.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        values.append(current.strip())
    return values


def strip_quotes(s):
    if s.startswith('"') and s.endswith('"'):
        return s[1:-1]
    return s


def to_number_if_possible(token):
    """Convert a string token to int/float if it parses, otherwise return the string."""
    if token == "":
        return token
    try:
        if "." in token or "e" in token or "E" in token:
            return float(token)
        return int(token)
    except ValueError:
        return token


_WEIGHT_PATTERN = re.compile(r"\s*\((\d+)\)\s*$")


def parse_value(raw, existing, aliases):
    """Parse a single value token.

    Handles ``~``, ``(weight)``, ``|aliases``, ``<ref>``, and ``"quotes"``.
    Returns ``(values, is_invalid, weight)``.
    """
    trimmed = raw.strip()

    # Parameter reference: <ParamName>
    if trimmed.startswith("<") and trimmed.endswith(">"):
        ref_name = trimmed[1:-1]
        if ref_name not in existing:
            raise ValueError('Unknown parameter reference: "{}"'.format(ref_name))
        return list(existing[ref_name]), False, 1

    token = trimmed
    is_invalid = False
    weight = 1

    # Negative prefix: ~
    if token.startswith("~"):
        token = token[1:]
        is_invalid = True

    # Weight suffix: (N)
    weight_match = _WEIGHT_PATTERN.search(token)
    if weight_match:
        weight = int(weight_match.group(1))
        token = token[:token.rfind("(")].strip()

    # Aliases: take canonical (first) value, record the rest
    if "|" in token:
        parts = [p.strip() for p in token.split("|")]
        canonical = strip_quotes(parts[0])
        for alias in parts[1:]:
            aliases[strip_quotes(alias)] = canonical
        token = parts[0]

    # Quoted string
    if token.startswith('"') and token.endswith('"'):
        return [token[1:-1]], is_invalid, weight

    return [to_number_if_possible(token)], is_invalid, weight


def is_parameter_line(trimmed):
    colon_idx = trimmed.find(":")
    if colon_idx <= 0:
        return False
    if trimmed.startswith("["):
        return False
    if re.match(r"^IF\s", trimmed, re.IGNORECASE):
        return False
    return True


def parse_pict_model(input_str):
    """Parse the parameter section of a PICT model.

    Returns a dict with keys ``factors``, ``aliases``, ``invalids``,
    ``weights``, ``errors``.
    """
    factors = {}
    aliases = {}
    invalids = {}
    weights = {}
    errors = []
    for line in input_str.split("\n"):
        trimmed = line.strip()
        if trimmed == "" or trimmed.startswith("#"):
            continue

        colon_index = trimmed.find(":")
        if colon_index == -1:
            errors.append('Invalid line (missing ":"): {}'.format(trimmed))
            continue

        key = trimmed[:colon_index].strip()
        if key == "":
            errors.append("Empty parameter name in line: {}".format(trimmed))
            continue

        try:
            raw_values = split_values(trimmed[colon_index + 1:])
            values = []
            invalid_set = set()
            factor_weights = {}
            for raw in raw_values:
                parsed_values, is_invalid, weight = parse_value(raw, factors, aliases)
                start_index = len(values)
                values.extend(parsed_values)
                if is_invalid:
                    for v in parsed_values:
                        invalid_set.add(v)
                if weight != 1:
                    for i in range(len(parsed_values)):
                        factor_weights[start_index + i] = weight

            if len(values) == 0:
                errors.append('No values for parameter "{}"'.format(key))
                continue

            factors[key] = values
            if invalid_set:
                invalids[key] = invalid_set
            if factor_weights:
                weights[key] = factor_weights
        except Exception as e:
            errors.append(str(e))

    return {
        "factors": factors,
        "aliases": aliases,
        "invalids": invalids,
        "weights": weights,
        "errors": errors,
    }


# Sub-model line: { P1, P2, P3 } @ N
SUB_MODEL_PATTERN = re.compile(r"^\{\s*(.+?)\s*\}\s*@\s*(\d+)\s*$")


def parse_sub_model(line):
    match = SUB_MODEL_PATTERN.match(line)
    if not match:
        return None
    keys = [k.strip() for k in match.group(1).split(",") if k.strip()]
    strength = int(match.group(2))
    return {"keys": keys, "strength": strength}
