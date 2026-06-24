# -- Active: 1782322337824@@127.0.0.1@5432@melodynet_db
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from server.db.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)  # lưu chuỗi mật khẩu đã hashed

class Song(Base):
    __tablename__ = "songs"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False, index=True)  # tên bài hát (được index để search nhanh)
    artist = Column(String(100), nullable=True)             # tên ca sĩ / nghệ sĩ
    file_path = Column(String(255), nullable=False)          # đường dẫn tuyệt đối tới file .mp3 trên server

class ListeningHistory(Base):
    __tablename__ = "history"
    id = Column(Integer, primary_key=True, index=True)
    # khóa ngoại liên kết tới bảng users (biết ai nghe)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # khóa ngoại liên kết tới bảng songs (biết nghe bài gì)
    song_id = Column(Integer, ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    # mốc thời gian nghe (tự động lấy thời gian thực tại của hệ thống khi ghi log)
    played_at = Column(DateTime(timezone=True), server_default=func.now())