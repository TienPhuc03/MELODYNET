import sys
import asyncio
from sqlalchemy import text
from server.db.database import engine, Base
from server.db.models import *
from server.tcp_server.protocol import pack_packet, unpack_packet

async def run_tcp_server():
    # khởi tạo một TCP Server thô bằng thư viện asyncio
    # lambda r, w: w.close() nghĩa là hễ có ai kết nối tới là đóng socket luôn để tránh treo bộ nhớ
    server = await asyncio.start_server(
        lambda r, w: w.close(), 
        "127.0.0.1", 
        # chỉ dùng để test, chạy thật sẽ chạy 0.0.0.0 và sài handle_function
        8888
    )
    
    print("[*] TCP Server ĐÃ KHỞI CHẠY THẬT trên cổng 8888...")
    
    # giữ cho server luôn chạy ngầm để liên tục đón nhận các kết nối mạng
    async with server:
        await server.serve_forever()

def init_and_check_db() -> bool:
    print("MELODYNET BACKEND SYSTEM - INITIALIZING...")
    try:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            print("Hệ thống cơ sở dữ liệu: SẴN SÀNG")
            return True
    except Exception as e:
        print(f"HỆ THỐNG LỖI KHỞI ĐỘNG DATABASE: {e}")
        return False
# hàm kích hoạt backend 
async def bootstrap():
    # kích hoạt hệ thống dữ liệu trước
    db_ready = init_and_check_db()
    if not db_ready:
        print("Hệ thống lõi dừng hoạt động do lỗi cấu hình Database.")
        sys.exit(1)
        
    # bật cổng mạng lắng nghe và kiểm tra giao thức
    print("[*] Đang kích hoạt cổng mạng TCP Server để nhận kết nối từ Client...")
    print("========================================================")
    
    try:
        await run_tcp_server()
    except KeyboardInterrupt:
        print("\n[!] Đang đóng hệ thống Backend MelodyNet an toàn...")

if __name__ == "__main__":
    try:
        asyncio.run(bootstrap())
    except KeyboardInterrupt:
        pass