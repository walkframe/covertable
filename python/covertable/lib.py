def get_items(container):
    if isinstance(container, list):
        return list(enumerate(container))
    elif isinstance(container, dict):
        return list(container.items())
    else:
        raise TypeError("factors must be list or dict.")
