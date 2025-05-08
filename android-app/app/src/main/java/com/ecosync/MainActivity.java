package com.ecosync;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.AsyncTask;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.UUID;

import javax.jmdns.JmDNS;
import javax.jmdns.ServiceEvent;
import javax.jmdns.ServiceInfo;
import javax.jmdns.ServiceListener;

/**
 * The main entry point Activity for the EcoSync application.
 * This Activity is launched when the user opens the app.
 * It will be responsible for displaying the main UI, allowing users to manage services,
 * initiate actions like file transfers, and navigate to settings or permission requests.
 */
public class MainActivity extends Activity {

    private static final String TAG = "EcoSyncMainActivity";
    private static final String JMDNS_SERVICE_TYPE = "_sic-sync._tcp.local.";
    private static final String PREFS_NAME = "EcoSyncPrefs";
    private static final String PREF_DEVICE_ID = "deviceId";
    private static final String PREF_IS_PAIRED = "isPaired";
    private static final String PREF_PAIRED_SERVER_NAME = "pairedServerName";

    private Button connectButton;
    private Button pairButton;
    private EditText pairingCodeEditText;
    private TextView statusTextView;

    private JmDNS jmdns = null;
    private ServiceListener jmdnsServiceListener;
    private ServiceInfo serverServiceInfo;
    private EcoSyncWebSocketClient webSocketClient;

    private String androidDeviceId;
    private SharedPreferences sharedPreferences;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        sharedPreferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        loadOrGenerateDeviceId();

        connectButton = findViewById(R.id.connectButton);
        pairButton = findViewById(R.id.pairButton);
        pairingCodeEditText = findViewById(R.id.pairingCodeEditText);
        statusTextView = findViewById(R.id.statusTextView);

        pairButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                initiatePairing();
            }
        });

        connectButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                connectToServer();
            }
        });

        updateUiBasedOnPairingState();
        new JmDNSSetupTask().execute();
    }

    private void loadOrGenerateDeviceId() {
        androidDeviceId = sharedPreferences.getString(PREF_DEVICE_ID, null);
        if (androidDeviceId == null) {
            String id = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
            if (id == null || id.equals("9774d56d682e549c") || id.length() < 16) {
                id = UUID.randomUUID().toString();
            }
            androidDeviceId = "android-" + id;
            sharedPreferences.edit().putString(PREF_DEVICE_ID, androidDeviceId).apply();
            Log.i(TAG, "Generated Android Device ID: " + androidDeviceId);
        }
    }

    private void initiatePairing() {
        String pairingCode = pairingCodeEditText.getText().toString().trim().toUpperCase();
        if (pairingCode.isEmpty()) {
            Toast.makeText(this, "Please enter the pairing code.", Toast.LENGTH_SHORT).show();
            return;
        }
        if (webSocketClient == null || !webSocketClient.isOpen()) {
            if (serverServiceInfo != null) {
                Toast.makeText(this, "Connecting to server first...", Toast.LENGTH_SHORT).show();
                connectToServer();
            } else {
                Toast.makeText(this, "Server not discovered. Please wait.", Toast.LENGTH_SHORT).show();
            }
            return;
        }

        try {
            JSONObject pairingRequest = new JSONObject();
            pairingRequest.put("type", "pairing_request");
            pairingRequest.put("code", pairingCode);
            pairingRequest.put("device_id", androidDeviceId);
            pairingRequest.put("device_name", android.os.Build.MODEL);
            pairingRequest.put("device_type", "android");

            webSocketClient.send(pairingRequest.toString());
            statusTextView.setText("Status: Pairing request sent...");
            Log.d(TAG, "Sent pairing request: " + pairingRequest.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error creating pairing JSON", e);
            statusTextView.setText("Status: Error creating pairing request");
        }
    }

    private void connectToServer() {
        if (serverServiceInfo != null) {
            try {
                String hostAddress = null;
                for (InetAddress addr : serverServiceInfo.getInet4Addresses()) {
                    hostAddress = addr.getHostAddress();
                    break;
                }
                if (hostAddress == null) {
                    Log.e(TAG, "No IPv4 address found for server.");
                    statusTextView.setText("Status: Error - No server IPv4 address");
                    return;
                }
                URI serverUri = new URI("ws://" + hostAddress + ":" + serverServiceInfo.getPort() + "/ws");
                Log.d(TAG, "Attempting to connect to: " + serverUri.toString());
                statusTextView.setText("Status: Connecting to " + serverUri.toString());

                if (webSocketClient != null && webSocketClient.isOpen()) {
                    webSocketClient.close();
                }
                webSocketClient = new EcoSyncWebSocketClient(serverUri);
                webSocketClient.connect();
            } catch (URISyntaxException e) {
                Log.e(TAG, "Invalid WebSocket URI", e);
                statusTextView.setText("Status: Error - Invalid URI");
            } catch (Exception e) {
                Log.e(TAG, "Error connecting to server", e);
                statusTextView.setText("Status: Error connecting");
            }
        } else {
            Log.w(TAG, "Server not discovered yet.");
            statusTextView.setText("Status: Server not found. Discovering...");
            if (jmdns == null || jmdnsServiceListener == null) {
                new JmDNSSetupTask().execute();
            }
        }
    }

    private void updateUiBasedOnPairingState() {
        boolean isPaired = sharedPreferences.getBoolean(PREF_IS_PAIRED, false);
        if (isPaired) {
            pairingCodeEditText.setVisibility(View.GONE);
            pairButton.setVisibility(View.GONE);
            connectButton.setVisibility(View.VISIBLE);
            statusTextView.setText("Status: Paired. Discovering server...");
        } else {
            pairingCodeEditText.setVisibility(View.VISIBLE);
            pairButton.setVisibility(View.VISIBLE);
            connectButton.setVisibility(View.GONE);
            statusTextView.setText("Status: Not Paired. Discovering server...");
        }
    }

    private class JmDNSSetupTask extends AsyncTask<Void, Void, Void> {
        @Override
        protected Void doInBackground(Void... voids) {
            try {
                InetAddress localAddress = InetAddress.getLocalHost();
                jmdns = JmDNS.create(localAddress);

                jmdnsServiceListener = new ServiceListener() {
                    @Override
                    public void serviceAdded(ServiceEvent event) {
                        Log.d(TAG, "JmDNS Service Added: " + event.getName());
                        jmdns.requestServiceInfo(event.getType(), event.getName(), 1000);
                    }

                    @Override
                    public void serviceRemoved(ServiceEvent event) {
                        Log.d(TAG, "JmDNS Service Removed: " + event.getName());
                        if (serverServiceInfo != null && event.getName().equals(serverServiceInfo.getName())) {
                            serverServiceInfo = null;
                            runOnUiThread(() -> statusTextView.setText("Status: Server disconnected"));
                            if (webSocketClient != null && webSocketClient.isOpen()) {
                                webSocketClient.close();
                            }
                        }
                    }

                    @Override
                    public void serviceResolved(ServiceEvent event) {
                        Log.d(TAG, "JmDNS Service Resolved: " + event.getName());
                        if (event.getInfo() != null && event.getInfo().getType().equals(JMDNS_SERVICE_TYPE)) {
                            serverServiceInfo = event.getInfo();
                            final String serverDetails = "Found: " + serverServiceInfo.getName() +
                                    " at " + (serverServiceInfo.getInet4Addresses().length > 0 ? serverServiceInfo.getInet4Addresses()[0].getHostAddress() : "N/A") +
                                    ":" + serverServiceInfo.getPort();
                            Log.i(TAG, serverDetails);
                            runOnUiThread(() -> {
                                boolean isPaired = sharedPreferences.getBoolean(PREF_IS_PAIRED, false);
                                if (isPaired) {
                                    statusTextView.setText("Status: Paired Server Found! Ready to connect.");
                                    connectButton.setEnabled(true);
                                } else {
                                    statusTextView.setText("Status: Server Found! Ready to pair.");
                                    pairButton.setEnabled(true);
                                }
                            });
                        }
                    }
                };

                jmdns.addServiceListener(JMDNS_SERVICE_TYPE, jmdnsServiceListener);
                Log.i(TAG, "JmDNS Service Listener added for type: " + JMDNS_SERVICE_TYPE);

            } catch (IOException e) {
                Log.e(TAG, "Error setting up JmDNS", e);
                runOnUiThread(() -> statusTextView.setText("Status: mDNS Error"));
            }
            return null;
        }

        @Override
        protected void onPreExecute() {
            super.onPreExecute();
            boolean isPaired = sharedPreferences.getBoolean(PREF_IS_PAIRED, false);
            statusTextView.setText(isPaired ? "Status: Paired. Discovering server..." : "Status: Not Paired. Discovering server...");
            connectButton.setEnabled(false);
            pairButton.setEnabled(false);
        }
    }

    private class EcoSyncWebSocketClient extends WebSocketClient {

        public EcoSyncWebSocketClient(URI serverUri) {
            super(serverUri);
            Log.d(TAG, "WebSocketClient created for URI: " + serverUri);
        }

        @Override
        public void onOpen(ServerHandshake handshakedata) {
            Log.i(TAG, "WebSocket Opened: " + handshakedata.getHttpStatusMessage());
            runOnUiThread(() -> {
                statusTextView.setText("Status: Connected to Server!");
                boolean isPaired = sharedPreferences.getBoolean(PREF_IS_PAIRED, false);
                if (isPaired) {
                    // Optionally send a hello message if needed by the server for re-connections
                }
            });
        }

        @Override
        public void onMessage(String message) {
            Log.i(TAG, "WebSocket Message Received: " + message);
            try {
                JSONObject jsonMessage = new JSONObject(message);
                String messageType = jsonMessage.optString("type");

                if ("pairing_response".equals(messageType)) {
                    String status = jsonMessage.optString("status");
                    if ("success".equals(status)) {
                        sharedPreferences.edit().putBoolean(PREF_IS_PAIRED, true).apply();
                        Log.i(TAG, "Pairing successful!");
                        runOnUiThread(() -> {
                            Toast.makeText(MainActivity.this, "Pairing Successful!", Toast.LENGTH_LONG).show();
                            updateUiBasedOnPairingState();
                        });
                    } else {
                        String reason = jsonMessage.optString("message", "Pairing failed.");
                        Log.w(TAG, "Pairing failed: " + reason);
                        runOnUiThread(() -> {
                            Toast.makeText(MainActivity.this, "Pairing Failed: " + reason, Toast.LENGTH_LONG).show();
                            statusTextView.setText("Status: Pairing Failed. Check code.");
                        });
                    }
                } else {
                    runOnUiThread(() -> {
                        TextView messagesTextView = findViewById(R.id.statusTextView);
                        messagesTextView.append("\nServer: " + messageType);
                    });
                }
            } catch (JSONException e) {
                Log.e(TAG, "Error parsing WebSocket message JSON", e);
                runOnUiThread(() -> statusTextView.append("\nInvalid msg from server."));
            }
        }

        @Override
        public void onClose(int code, String reason, boolean remote) {
            Log.i(TAG, "WebSocket Closed. Code: " + code + ", Reason: " + reason + ", Remote: " + remote);
            final String status = "Status: Disconnected - " + reason;
            runOnUiThread(() -> statusTextView.setText(status));
        }

        @Override
        public void onError(Exception ex) {
            Log.e(TAG, "WebSocket Error", ex);
            final String status = "Status: WebSocket Error - " + ex.getMessage();
            runOnUiThread(() -> statusTextView.setText(status));
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (jmdns != null) {
            if (jmdnsServiceListener != null) {
                jmdns.removeServiceListener(JMDNS_SERVICE_TYPE, jmdnsServiceListener);
                jmdnsServiceListener = null;
            }
            try {
                jmdns.close();
                Log.i(TAG, "JmDNS closed.");
            } catch (IOException e) {
                Log.e(TAG, "Error closing JmDNS", e);
            }
            jmdns = null;
        }
        if (webSocketClient != null) {
            webSocketClient.close();
            webSocketClient = null;
            Log.i(TAG, "WebSocket client closed.");
        }
    }
}