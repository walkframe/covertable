def extract(sorted_incomplete, row, parents, **kwargs):
    for pair in sorted_incomplete:
        storable = row.storable([(parents[p], p) for p in pair])
        if storable is None:
            continue
        yield pair
