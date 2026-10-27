import os
import json
import paho.mqtt.client as mqtt

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_TOPIC = "simpro/produccion/#"
COMMAND_TOPIC_PREFIX = "simpro/comandos"

# Esta función actuará como puente para enviar los datos MQTT a los WebSockets conectados
mensaje_callback = None 

def set_message_callback(callback):
    global mensaje_callback
    mensaje_callback = callback

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"Conectado a MQTT Broker en {MQTT_BROKER}")
        client.subscribe(MQTT_TOPIC)
    else:
        print(f"Error de conexión MQTT, código: {rc}")

def on_message(client, userdata, msg):
    try:
        # Ignorar comandos (no son telemetría de producción)
        if msg.topic.startswith(COMMAND_TOPIC_PREFIX):
            return
        # Decodifica el mensaje del ESP32 (asumiendo que envía JSON)
        payload = msg.payload.decode("utf-8")
        data = json.loads(payload)
        topic = msg.topic
        
        # Aquí se ejecutaría la lógica para guardar en base de datos PostgreSQL
        
        # Enviar al callback para emitir por WebSocket
        if mensaje_callback:
            mensaje_callback({"topic": topic, "data": data})
            
    except Exception as e:
        print(f"Error procesando mensaje MQTT: {e}")

mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

def start_mqtt():
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()

def stop_mqtt():
    mqtt_client.loop_stop()
    mqtt_client.disconnect()


def _publish_command(station_id: str, action: str) -> bool:
    if not station_id:
        return False
    topic = f"{COMMAND_TOPIC_PREFIX}/{station_id}"
    payload = json.dumps({"action": action, "station_id": station_id})
    try:
        result = mqtt_client.publish(topic, payload, qos=0)
        return result.rc == mqtt.MQTT_ERR_SUCCESS
    except Exception as e:
        print(f"Error publicando comando MQTT ({action}): {e}")
        return False


def publish_stop(station_id: str) -> bool:
    """Publica comando MQTT para que el sensor/simulador mantenga la estación parada."""
    return _publish_command(station_id, "stop")


def publish_resolve(station_id: str) -> bool:
    """Publica comando MQTT para que el sensor/simulador reactive la estación."""
    return _publish_command(station_id, "resolve")
