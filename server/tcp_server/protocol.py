from __future__ import annotations

import json
import struct
from enum import IntEnum
from typing import NamedTuple


# >HIH: big-endian | H=uint16 msg_type | I=uint32 seq_no | H=uint16 payload_len
# Header size: 2 + 4 + 2 = 8 bytes
# payload_len max: 65,535 bytes — đủ cho chunk_size=16384 và JSON nhỏ
HEADER_FORMAT = ">HIH"
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)  # 8 bytes


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
    if payload_len > 65_535:
        raise ValueError(
            f"Payload quá lớn: {payload_len} bytes (tối đa 65,535 với format HIH). "
            "Hãy chia nhỏ payload hoặc dùng format >HII nếu cần payload lớn hơn."
        )
    header_bytes = struct.pack(HEADER_FORMAT, msg_type, seq_no, payload_len)
    return header_bytes + payload


def unpack_packet(header_bytes: bytes) -> PacketHeader:
    if len(header_bytes) != HEADER_SIZE:
        raise ValueError(f"Header phải đúng {HEADER_SIZE} bytes, nhận {len(header_bytes)} bytes.")
    msg_type, seq_no, payload_len = struct.unpack(HEADER_FORMAT, header_bytes)
    return PacketHeader(msg_type=msg_type, seq_no=seq_no, payload_len=payload_len)


def build_json_packet(msg_type: PacketType, seq_no: int, payload: dict) -> bytes:
    encoded_payload = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return pack_packet(int(msg_type), seq_no, encoded_payload)


def decode_json_payload(payload: bytes) -> dict:
    return json.loads(payload.decode("utf-8"))