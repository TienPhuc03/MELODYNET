import sys
from sqlalchemy import text
from server.db.database import engine,Base
from server.db.models import *

# hàm kiểm tra tình trạng db 
def check_db():
    print ("Melodynet Database - Check Healthy")
    try:
        # quét và sinh db nếu chưa có
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("Ket noi csdl thanh cong", result.scalar())
            return True
    except Exception as e:
        print("Ket noi csdl that bai", e)
        return False

if __name__ == "__main__":
    check_db()