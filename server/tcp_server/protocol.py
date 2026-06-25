from __future__ import annotations

import json
import struct
from enum import IntEnum
from typing import NamedTuple


HEADER_FORMAT = ">BII"
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)


class PacketType(IntEnum):
    AUTH = 1
    SEARCH = 2
    STREAM_START = 3
    STREAM_CHUNK = 4
    STREAM_END = 5
    ERROR = 6
    PING = 7


class PacketHeader(NamedTuple):
    msg_type: int
    seq_no: int
    payload_len: int


def pack_packet(msg_type: int, seq_no: int, payload: bytes) -> bytes:
    payload_len = len(payload)
    header_bytes = struct.pack(HEADER_FORMAT, msg_type, seq_no, payload_len)
    return header_bytes + payload


def unpack_packet(header_bytes: bytes) -> PacketHeader:
    if len(header_bytes) != HEADER_SIZE:
        raise ValueError(f"Header size must be {HEADER_SIZE} bytes.")
    msg_type, seq_no, payload_len = struct.unpack(HEADER_FORMAT, header_bytes)
    return PacketHeader(msg_type=msg_type, seq_no=seq_no, payload_len=payload_len)


def build_json_packet(msg_type: PacketType, seq_no: int, payload: dict) -> bytes:
    encoded_payload = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return pack_packet(int(msg_type), seq_no, encoded_payload)


def decode_json_payload(payload: bytes) -> dict:
    return json.loads(payload.decode("utf-8"))

