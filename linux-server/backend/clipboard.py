import pyperclip
import time
import threading
import logging
import json
from datetime import datetime

logger = logging.getLogger(__name__)

class ClipboardMonitor:
    def __init__(self, broadcast_callback, poll_interval=0.5):
        """
        Initialize clipboard monitor
        
        Args:
            broadcast_callback: Async function that sends clipboard data to clients
            poll_interval: How often to check clipboard (seconds)
        """
        self.broadcast_callback = broadcast_callback
        self.poll_interval = poll_interval
        self.last_content = ""
        self.running = False
        self.monitor_thread = None
        
    def start(self):
        """Start the clipboard monitoring thread"""
        if self.running:
            return
            
        self.running = True
        self.monitor_thread = threading.Thread(target=self._monitor_clipboard)
        self.monitor_thread.daemon = True
        self.monitor_thread.start()
        logger.info("Clipboard monitoring started")
        
    def stop(self):
        """Stop the clipboard monitoring thread"""
        self.running = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=2.0)
        logger.info("Clipboard monitoring stopped")
        
    def _monitor_clipboard(self):
        """Monitor clipboard for changes"""
        try:
            # Get initial clipboard content
            try:
                self.last_content = pyperclip.paste()
            except:
                self.last_content = ""
                logger.warning("Could not access clipboard initially")
            
            while self.running:
                try:
                    # Get current clipboard content
                    current_content = pyperclip.paste()
                    
                    # Check if content changed
                    if current_content != self.last_content:
                        self.last_content = current_content
                        
                        # Create message payload
                        message = {
                            "type": "clipboard",
                            "content": current_content,
                            "timestamp": datetime.now().isoformat()
                        }
                        
                        # Use threading to call the async broadcast function
                        threading.Thread(
                            target=self._async_broadcast, 
                            args=(json.dumps(message),)
                        ).start()
                        
                        logger.info(f"Clipboard changed: {current_content[:50]}...")
                except Exception as e:
                    logger.error(f"Error monitoring clipboard: {e}")
                
                # Wait before next check
                time.sleep(self.poll_interval)
        except Exception as e:
            logger.error(f"Clipboard monitor thread error: {e}")
            
    def _async_broadcast(self, message):
        """Helper to call async broadcast function from thread"""
        import asyncio
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            loop.run_until_complete(self.broadcast_callback(message))
        finally:
            loop.close()
            
    def set_clipboard(self, content):
        """Set clipboard content"""
        try:
            pyperclip.copy(content)
            self.last_content = content
            logger.info(f"Clipboard set: {content[:50]}...")
            return True
        except Exception as e:
            logger.error(f"Error setting clipboard: {e}")
            return False