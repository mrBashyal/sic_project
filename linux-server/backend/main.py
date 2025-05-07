from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import uvicorn
import os
import logging
from pathlib import Path
import socket
import json
import uuid
import threading
from zeroconf import ServiceInfo, Zeroconf
import time
import random
import string
import psutil  # Add this import to check for port usage

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="Offline Device Integration System")

# Set up Jinja2 templates
BASE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Create templates directory if it doesn't exist
os.makedirs(BASE_DIR / "templates", exist_ok=True)

# Create static directory if it doesn't exist
os.makedirs(BASE_DIR / "static", exist_ok=True)

# Mount static files directory
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# Generate or load a unique device ID
DEVICE_ID_FILE = BASE_DIR / ".device_id"
def load_device_id():
    if DEVICE_ID_FILE.exists():
        try:
            with open(DEVICE_ID_FILE, "r") as f:
                device_id = f.read().strip()
                if device_id:
                    logger.info(f"Loaded device ID from file: {device_id}")
                    return device_id
        except Exception as e:
            logger.error(f"Error reading device ID file: {e}")
    # Generate new if not found or invalid
    device_id = str(uuid.uuid4())
    with open(DEVICE_ID_FILE, "w") as f:
        f.write(device_id)
    logger.info(f"Generated new device ID: {device_id}")
    return device_id

DEVICE_ID = load_device_id()

# Store pairing code persistently
PAIRING_CODE_FILE = BASE_DIR / ".pairing_code"
def load_pairing_code(length=6):
    if PAIRING_CODE_FILE.exists():
        try:
            with open(PAIRING_CODE_FILE, "r") as f:
                code = f.read().strip()
                if code and len(code) == length:
                    logger.info(f"Loaded pairing code from file: {code}")
                    return code
        except Exception as e:
            logger.error(f"Error reading pairing code file: {e}")
    # Generate new if not found or invalid
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))
    with open(PAIRING_CODE_FILE, "w") as f:
        f.write(code)
    logger.info(f"Generated new pairing code: {code}")
    return code

PAIRING_CODE = load_pairing_code()

PAIRED_DEVICES = {}  # Store MAC address / device ID of paired devices
PAIRING_FILE = BASE_DIR / ".paired_devices"

# Load any previously paired devices
if PAIRING_FILE.exists():
    try:
        with open(PAIRING_FILE, "r") as f:
            PAIRED_DEVICES.update(json.load(f))
            logger.info(f"Loaded paired devices from file: {PAIRED_DEVICES}")
    except Exception as e:
        logger.error(f"Error reading paired devices file: {e}")

def save_paired_devices():
    try:
        with open(PAIRING_FILE, "w") as f:
            json.dump(PAIRED_DEVICES, f)
        logger.info("Paired devices saved successfully.")
    except Exception as e:
        logger.error(f"Error saving paired devices: {e}")

class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, websocket: WebSocket, device_id: str | None = None):
        await websocket.accept()
        # Fixing the indentation error in the main.py file
        # Correcting the indentation of the block that checks if the device ID is paired
        if device_id and device_id in PAIRED_DEVICES:
            self.active_connections[device_id] = websocket
            logger.info(f"Paired device {device_id} connected. Total connections: {len(self.active_connections)}")
        else:
            # For unpaired/new connections, use websocket object as key temporarily
            temp_id = str(id(websocket))
            self.active_connections[temp_id] = websocket
            logger.info(f"New unpaired connection {temp_id}. Total connections: {len(self.active_connections)}")
        return device_id or temp_id
    
    def disconnect(self, connection_id: str):
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]
            logger.info(f"Connection {connection_id} closed. Total connections: {len(self.active_connections)}")
    
    async def broadcast(self, message_dict: dict, exclude=None):
        message = json.dumps(message_dict)
        for conn_id, connection in self.active_connections.items():
            if exclude != conn_id:
                try:
                    await connection.send_text(message)
                except Exception as e:
                    logger.error(f"Error sending to {conn_id}: {e}")
                    # We'll handle reconnection elsewhere, just log for now
    
    async def send_to_device(self, device_id: str, message_dict: dict):
        if device_id in self.active_connections:
            try:
                await self.active_connections[device_id].send_text(json.dumps(message_dict))
                return True
            except Exception as e:
                logger.error(f"Error sending to device {device_id}: {e}")
                return False
        return False

manager = ConnectionManager()

# mDNS Service setup
def setup_mdns():
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    port = 8000  # Our FastAPI server port

    # Check if the port is already in use
    for conn in psutil.net_connections(kind='inet'):
        if conn.laddr and hasattr(conn.laddr, 'port') and conn.laddr.port == port:
            logger.error(f"Port {port} is already in use. mDNS setup aborted.")
            return None, None

    logger.info(f"Setting up mDNS with IP: {local_ip}")

    # Create ServiceInfo object
    service_info = ServiceInfo(
        "_sic-sync._tcp.local.",  # Service type
        f"{hostname}-sic-sync._sic-sync._tcp.local.",  # Service name
        addresses=[socket.inet_aton(local_ip)],
        port=port,
        weight=0,
        priority=0,
        properties={
            b'deviceid': DEVICE_ID.encode('utf-8'),
            b'type': b'linux-server',
            b'hostname': hostname.encode('utf-8'),
        }
    )

    zeroconf = Zeroconf()
    zeroconf.register_service(service_info)
    logger.info(f"mDNS service registered: {service_info.name}")

    # Return zeroconf and service_info for later unregistration
    return zeroconf, service_info

# Initialize mDNS on server startup
@app.on_event("startup")
async def startup_event():
    # Start mDNS service in a separate thread to avoid blocking
    threading.Thread(target=setup_mdns, daemon=True).start()
    logger.info(f"Server started with device ID: {DEVICE_ID}")
    logger.info(f"Initial pairing code: {PAIRING_CODE}")

@app.get("/")
async def get_home(request: Request):
    """Serve the homepage with WebSocket client"""
    hostname = socket.gethostname()
    return templates.TemplateResponse("index.html", {
        "request": request,
        "device_id": DEVICE_ID,
        "hostname": hostname,
        "pairing_code": PAIRING_CODE,
    })

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time communication"""
    connection_id = await manager.connect(websocket)
    
    try:
        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            logger.debug(f"Message received: {data}")
            
            # Handle message based on its type
            if data.get("type") == "pairing_request":
                await handle_pairing(websocket, connection_id, data)
            elif data.get("type") == "clipboard_sync":
                await handle_clipboard(websocket, connection_id, data)
            elif data.get("type") == "notification":
                await handle_notification(connection_id, data)
            elif data.get("type") == "file_transfer_init":
                await handle_file_transfer_init(websocket, connection_id, data)
            elif data.get("type") == "file_transfer_chunk":
                await handle_file_transfer_chunk(connection_id, data)
            elif data.get("type") == "ping":
                # Handle heartbeat ping
                await websocket.send_text(json.dumps({"type": "pong"}))
            else:
                logger.warning(f"Unknown message type: {data.get('type')}")
                
    except WebSocketDisconnect:
        manager.disconnect(connection_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(connection_id)

# Handler functions for different message types
async def handle_pairing(websocket, connection_id, data):
    """Handle device pairing requests"""
    global PAIRING_CODE
    if data.get("code") == PAIRING_CODE:
        device_id = data.get("device_id")
        device_name = data.get("device_name", "Unknown Device")
        device_type = data.get("device_type", "unknown")
        
        # Store the pairing and save
        PAIRED_DEVICES[device_id] = {
            "name": device_name,
            "type": device_type,
            "paired_at": time.time()
        }
        save_paired_devices()
        
        # Send pairing confirmation
        await websocket.send_text(json.dumps({
            "type": "pairing_response",
            "status": "success",
            "device_id": device_id,
            "device_name": device_name,
            "device_type": device_type
        }))
        
        # Update connection manager
        manager.disconnect(connection_id)
        await manager.connect(websocket, device_id)
    else:
        await websocket.send_text(json.dumps({
            "type": "pairing_response",
            "status": "failed",
            "reason": "Invalid pairing code"
        }))

async def handle_clipboard(websocket, connection_id, data):
    """Stub for clipboard synchronization handling"""
    logger.info("Clipboard sync request received but not implemented.")

async def handle_file_transfer_init(websocket, connection_id, data):
    """Stub for file transfer initialization"""
    logger.info("File transfer init request received but not implemented.")

async def handle_file_transfer_chunk(connection_id, data):
    """Stub for file transfer chunk handling"""
    logger.info("File transfer chunk received but not implemented.")

async def handle_notification(connection_id, data):
    """Handle incoming notifications"""
    try:
        notification_type = data.get("notification_type")
        message = data.get("message")

        if not notification_type or not message:
            logger.warning("Invalid notification data received.")
            return

        logger.info(f"Notification received: {notification_type} - {message}")

        # Example: Broadcast the notification to all connected clients
        await manager.broadcast({
            "type": "notification",
            "notification_type": notification_type,
            "message": message
        }, exclude=connection_id)

    except Exception as e:
        logger.error(f"Error processing notification: {e}")