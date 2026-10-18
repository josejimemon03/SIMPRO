from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProduccionBase(BaseModel):
    linea_id: str
    contador: int = 0
    oee: Optional[float] = None
    disponible: bool = True


class ProduccionCreate(ProduccionBase):
    pass


class ProduccionResponse(ProduccionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class MqttMessage(BaseModel):
    topic: str
    data: dict
