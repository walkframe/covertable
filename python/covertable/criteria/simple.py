
def extract(sorted_incompleted, row, parents, **kwargs):
    for pair in sorted_incompleted:
        storable = row.storable([(parents[p], p) for p in pair])
        if storable is None:
            continue
        yield pair
