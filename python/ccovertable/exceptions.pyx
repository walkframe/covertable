class InvalidCondition(BaseException):
    cdef str message = "It will never meet the condition"
