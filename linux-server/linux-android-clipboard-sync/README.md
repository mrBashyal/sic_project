# linux-android-clipboard-sync Project

This project enables real-time clipboard sharing between a Linux system and an Android device, allowing seamless copying and pasting without user intervention after initial permission is granted.

## Project Structure

```
linux-android-clipboard-sync
├── linux-server
│   ├── src
│   │   ├── serve.py              # Main server file
│   │   ├── clipboard_monitor.py  # Linux clipboard monitoring
│   │   ├── websocket_server.py   # WebSocket server for real-time sync
│   │   └── utils.py              # Utility functions
│   ├── requirements.txt
│   └── README.md
├── android-app
│   ├── app
│   │   ├── src
│   │   │   ├── main
│   │   │   │   ├── java
│   │   │   │   │   └── com
│   │   │   │   │       └── clipshare
│   │   │   │   │           ├── MainActivity.java
│   │   │   │   │           ├── ClipboardService.java
│   │   │   │   │           └── WebSocketClient.java
│   │   │   │   ├── res
│   │   │   │   │   └── layout
│   │   │   │   │       ├── activity_main.xml
│   │   │   │   │       └── settings_fragment.xml
│   │   │   │   └── AndroidManifest.xml
│   │   │   └── test
│   │   └── build.gradle
│   ├── gradle
│   └── build.gradle
├── shared
│   └── protocol.md               # Shared protocol documentation
└── README.md
```

## Setup Instructions

### Linux Server

1. Navigate to the `linux-server` directory.
2. Install the required Python packages:
   ```
   pip install -r requirements.txt
   ```
3. Run the server:
   ```
   python src/serve.py
   ```

### Android App

1. Open the `android-app` directory in Android Studio.
2. Sync the project with Gradle files.
3. Ensure the necessary permissions for clipboard access are declared in `AndroidManifest.xml`.
4. Build and run the application on your Android device.

## Usage

- After setting up both the Linux server and the Android app, grant the necessary permissions for clipboard access on your Android device.
- Copy any text on your Linux system, and it will automatically be available on your Android device's clipboard, and vice versa.

## Contributing

Feel free to submit issues or pull requests to improve the functionality and performance of the clipboard synchronization feature.