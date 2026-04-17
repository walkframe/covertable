class InvalidCondition(BaseException):
    message = "It will never meet the condition"


class NeverMatch(Exception):
    pass
