import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# La URL viene de las variables de entorno de Docker
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://simpro_user:simpro_password@localhost:5432/simpro_db"
)

engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
