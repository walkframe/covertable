def get_items(container):
    if isinstance(container, list):
        return enumerate(container)
    elif isinstance(container, dict):
        return container.items()
    else:
        raise TypeError("factors must be list or dict.")
