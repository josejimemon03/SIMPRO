from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.sql import func

from app.database import Base


class Produccion(Base):
    """Registro de producción recibido desde los ESP32 vía MQTT."""

    __tablename__ = "produccion"

    id = Column(Integer, primary_key=True, index=True)
    linea_id = Column(String(50), index=True, nullable=False)
    contador = Column(Integer, default=0)
    oee = Column(Float, nullable=True)
    disponible = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
