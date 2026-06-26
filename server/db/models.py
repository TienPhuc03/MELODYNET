from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from server.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_admin = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    history = relationship("ListeningHistory", back_populates="user", cascade="all, delete-orphan")


class Song(Base):
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False, index=True)
    artist = Column(String(100), nullable=True, index=True)
    file_path = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False, default="audio/wav")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    history = relationship("ListeningHistory", back_populates="song")


class ListeningHistory(Base):
    __tablename__ = "history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    song_id = Column(Integer, ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    played_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="history")
    song = relationship("Song", back_populates="history")
