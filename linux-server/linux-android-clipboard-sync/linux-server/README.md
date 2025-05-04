# Linux-Android Clipboard Sync

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
│   ├── requirements.txt           # Python dependencies
│   └── README.md                  # Linux server documentation
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
└── README.md                     # Overall project documentation
```

## Setup Instructions

### Linux Server

1. **Install Dependencies**: Navigate to the `linux-server` directory and install the required Python packages listed in `requirements.txt`:
   ```
   pip install -r requirements.txt
   ```

2. **Run the Server**: Start the Flask server by executing the following command:
   ```
   python src/serve.py
   ```

### Android App

1. **Open the Project**: Open the `android-app` directory in Android Studio.

2. **Build the App**: Sync the project with Gradle files and build the application.

3. **Run the App**: Deploy the app on an Android device or emulator.

## Usage

- After setting up both the Linux server and the Android app, grant the necessary permissions for clipboard access on both devices.
- The clipboard content will be synchronized in real-time between the Linux system and the Android device.

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.