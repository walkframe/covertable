"""Helpers for converting human-friendly weight specifications."""


def weights_by_value(factors, value_weights):
    """Convert value-keyed weights to index-keyed weights.

    Useful when you want to specify weights by value rather than by index
    position.

    Example::

        weights_by_value(
            {"Browser": ["Chrome", "Firefox", "Safari"]},
            {"Browser": {"Chrome": 10, "Safari": 5}},
        )
        # → {"Browser": {0: 10, 2: 5}}
    """
    result = {}
    for key, vw in value_weights.items():
        values = factors.get(key)
        if values is None:
            continue
        index_weights = {}
        for value, weight in vw.items():
            for i, v in enumerate(values):
                if str(v) == str(value):
                    index_weights[i] = weight
                    break
        if index_weights:
            result[key] = index_weights
    return result
