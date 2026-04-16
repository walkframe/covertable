class InvalidCondition(BaseException):
    message = "It will never meet the condition"


class NotReady(Exception):
    def __init__(self, key):
        super().__init__(f"Not yet '{key}' in the object")
        self.key = key


class NeverMatch(Exception):
    pass
