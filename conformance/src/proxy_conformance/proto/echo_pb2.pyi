from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class EchoRequest(_message.Message):
    __slots__ = ("message", "payload")
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    PAYLOAD_FIELD_NUMBER: _ClassVar[int]
    message: str
    payload: bytes
    def __init__(self, message: _Optional[str] = ..., payload: _Optional[bytes] = ...) -> None: ...

class EchoResponse(_message.Message):
    __slots__ = ("message", "payload", "sequence")
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    PAYLOAD_FIELD_NUMBER: _ClassVar[int]
    SEQUENCE_FIELD_NUMBER: _ClassVar[int]
    message: str
    payload: bytes
    sequence: int
    def __init__(self, message: _Optional[str] = ..., payload: _Optional[bytes] = ..., sequence: _Optional[int] = ...) -> None: ...

class StreamRequest(_message.Message):
    __slots__ = ("message", "count")
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    message: str
    count: int
    def __init__(self, message: _Optional[str] = ..., count: _Optional[int] = ...) -> None: ...
