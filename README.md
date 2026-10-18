# SIMPRO

Dashboard de monitoreo de línea de producción (OEE, estaciones, paradas y alertas).

Incluye:

- **Frontend** (React + Vite) — vistas Operario y Supervisor  
- **Backend** (FastAPI + WebSocket) — sincronización en tiempo real  
- **Broker MQTT + simulador de sensores** — telemetría y paradas automáticas  

---

## Requisitos

| Herramienta | Versión sugerida |
|-------------|------------------|
| Python      | 3.9+ |
| Node.js / npm | 18+ (LTS) |
| Docker      | Opcional (alternativa al arranque local) |

### Si no tienes `npm` (macOS / Linux)

La forma más fácil es instalar **nvm** y luego Node:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Cierra y abre la terminal (o carga nvm):

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install --lts
node -v   # debe mostrar una versión
npm -v
```

En Windows, puedes usar [nvm-windows](https://github.com/coreybutler/nvm-windows) o instalar Node desde [nodejs.org](https://nodejs.org/).

---

## Arranque rápido (recomendado, sin Docker)

Necesitas **2 terminales**.

### Terminal 1 — Backend (broker + API + sensores)

```bash
cd simpro-backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
chmod +x scripts/start_local.sh
./scripts/start_local.sh
```

Eso levanta:

- Broker MQTT en `127.0.0.1:1883`
- API en [http://127.0.0.1:8000](http://127.0.0.1:8000)
- Simulador de sensores (telemetría y fallas aleatorias)

Deja esta terminal abierta. `Ctrl+C` detiene todo el backend.

### Terminal 2 — Frontend

```bash
cd simpro-frontend
npm install
npm run dev
```

Abre en el navegador la URL que muestre Vite (normalmente [http://localhost:5173](http://localhost:5173)).

---

## Arranque con Docker

Útil si prefieres no instalar Python a mano.

### Terminal 1 — Stack backend

```bash
cd simpro-backend
docker compose --profile sim up --build
```

Incluye base de datos, broker MQTT, API y simulador de sensores.

### Terminal 2 — Frontend (igual que arriba)

```bash
cd simpro-frontend
npm install
npm run dev
```

Para detener Docker:

```bash
cd simpro-backend
docker compose --profile sim down
```

---

## URLs útiles

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:5173 |
| API | http://127.0.0.1:8000 |
| Health | http://127.0.0.1:8000/api/health |

---

## Cómo probar la app

1. Entra como **Supervisor** o **Operario**.
2. **Operario**: elige una estación y reporta una parada → el supervisor ve la alerta.
3. **Supervisor**: “Marcar como resuelta” reactiva la estación.
4. El **simulador** también puede parar estaciones solo (causa *Parada automática (sensor)*); el supervisor recibe la alerta y puede reactivarlas igual.

---

## Tests (opcional)

```bash
# Backend
cd simpro-backend
source .venv/bin/activate
pytest

# Frontend
cd simpro-frontend
npm test
```

---

## Problemas frecuentes

**`zsh: command not found: npm`**  
Instala Node con nvm (sección *Requisitos* arriba) y vuelve a abrir la terminal.

**El frontend no muestra telemetría / estaciones no se actualizan**  
Asegúrate de que el backend (`start_local.sh` o Docker con `--profile sim`) esté corriendo antes que el frontend.

**Puerto 8000 o 5173 ocupado**  
Cierra el proceso que lo use o cambia el puerto de Vite: `npm run dev -- --port 5174`.

**MQTT / sensores no conectan**  
Con el script local, el broker se inicia solo. Con Docker, usa siempre `--profile sim` para incluir el simulador.
