def extract(ctrl):
    for pair_key, pair in list(ctrl.incomplete.items()):
        cand = ctrl.get_candidate(pair)
        storable = ctrl.storable(cand)
        if storable is None or storable == 0:
            continue
        yield pair
