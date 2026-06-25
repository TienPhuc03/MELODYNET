# struct là cầu nối giữa python và chuỗi các bytes
import struct  
from typing import NamedTuple

HEADER_FORMAT=">HIH"
HEADER_SIZE= struct.calcsize(HEADER_FORMAT)

class PackHeader (NamedTuple):
    msg_type: int 
    payload_len: int 
    seq_no: int 
# đóng gói 
def pack_packet (msg_type: int, seq_no: int, payload: bytes) -> bytes:
    payload_len = len(payload)
    header_bytes = struct.pack(HEADER_FORMAT, msg_type, seq_no, payload_len)
    return header_bytes + payload
# giải nén 8 bytes tiêu đề thành tên tường minh ở PackHeader
def unpack_packet (header_bytes: bytes) ->pack_packet:
    if len(header_bytes) != HEADER_SIZE:
        raise ValueError
    # giải nén
    unpack_packet = struct.unpack(HEADER_FORMAT, header_bytes)
    # bọc dữ liệu và PackHeader để có thể gọi bằng tên thay vì gọi bằng index 
    return PackHeader(
        msg_type=unpack_packet[0],
        payload_len=unpack_packet[1],
        seq_no=unpack_packet[2]
    )


# KIỂM THỬ PHIÊN BẢN MỚI
# ==============================================================================
if __name__ == "__main__":
    print("========================================================")
    print("🚀 MELODYNET - IMPROVED NETWORK PROTOCOL")
    print("========================================================")
    
    sample_data = "Dữ liệu âm thanh mã hóa".encode("utf-8")
    packed_data = pack_packet(msg_type=2, seq_no=99, payload=sample_data)
    
    # Phía nhận: Giải mã
    header = unpack_packet(packed_data[:HEADER_SIZE])
    
    # CODE BÂY GIỜ ĐỌC RẤT SẠCH VÀ DỄ HIỂU:
    print(f"[+] Loại tin nhắn: {header.msg_type}")      # Gọi trực tiếp bằng .msg_type
    print(f"[+] Độ dài dữ liệu: {header.payload_len}")   # Gọi trực tiếp bằng .payload_len
    print(f"[+] Số thứ tự mảnh: {header.seq_no}")        # Gọi trực tiếp bằng .seq_no
    
    actual_payload = packed_data[HEADER_SIZE : HEADER_SIZE + header.payload_len]
    print(f"[+] Nội dung: {actual_payload.decode('utf-8')}")