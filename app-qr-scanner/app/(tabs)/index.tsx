import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, Alert, AppState } from 'react-native';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import BackgroundService from 'react-native-background-actions';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// Use configuration from system
const SOCKET_URL = 'ws://192.168.1.15:8000/ws';

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isPaired, setIsPaired] = useState(false);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<{
    id: string;
    name: string;
    type: string;
  } | null>(null);
  
  const socketRef = useRef<WebSocket | null>(null);
  const appState = useRef(AppState.currentState);

  // Check for existing pairing on mount
  useEffect(() => {
    checkExistingPairing();
    requestPermission();
  }, []);

  // Monitor app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const checkExistingPairing = async () => {
    // In a real app, we would check for stored credentials
    // For now, we'll just try to connect to the WebSocket
    connectWebSocket();
  };

  const handleAppStateChange = async (nextAppState: string) => {
    if (nextAppState === 'active') {
      // App coming to foreground - check connection
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        connectWebSocket();
      }
    }
  };

  const handleBarCodeScanned = ({ data }: BarcodeScanningResult) => {
    setScanned(true);
    
    // Extract pairing code from QR data (assuming format: "sic://device-id/pairing-code")
    const segments = data.split('/');
    const code = segments.pop();
    const deviceId = segments.length > 2 ? segments[segments.length - 1] : null;
    
    if (code) {
      setPairingCode(code);
      connectWebSocket(code, deviceId);
    } else {
      Alert.alert('Invalid QR Code', 'The scanned code is not in the expected format.');
    }
    
    setShowCamera(false);
  };

  const connectWebSocket = (code: string | null = null, remoteDeviceId: string | null = null) => {
    // If already connected, close existing connection
    if (socketRef.current) {
      socketRef.current.close();
    }
    
    setSocketStatus('connecting');
    
    const ws = new WebSocket(SOCKET_URL);
    
    ws.onopen = () => {
      console.log('WebSocket connected on Home screen');
      setSocketStatus('connected');
      
      if (code) {
        // Attempting to pair with code
        const deviceId = `app-qr-scanner-${Math.random().toString(36).substring(2, 10)}`;
        
        ws.send(JSON.stringify({
          "code": code,
          "device_id": deviceId,
          "device_name": "EcoSync Mobile",
          "device_type": "react-native"
        }));
        
        setDeviceInfo({
          id: deviceId,
          name: "EcoSync Mobile",
          type: "react-native"
        });
      } else {
        // Already paired - try to authenticate with stored credentials
        // This would use stored credentials in a real app
        console.log('No pairing code available - would use stored credentials');
      }
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('WebSocket message received:', message);
        
        // Handle pairing response
        if (message.type === 'pairing_response') {
          if (message.status === 'success') {
            setIsPaired(true);
            Alert.alert(
              'Pairing Successful', 
              'Your device has been successfully paired with the Ubuntu computer.'
            );
            
            // In a real app, store credentials securely here
          } else {
            Alert.alert(
              'Pairing Failed', 
              message.reason || 'Unknown error occurred during pairing.'
            );
          }
        }
        
        // Handle server status update
        else if (message.type === 'server_status') {
          // Update connection status indicator
          // In a real app, we'd sync settings here
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setSocketStatus('disconnected');
    };
    
    ws.onclose = () => {
      console.log('WebSocket connection closed');
      setSocketStatus('disconnected');
    };
    
    socketRef.current = ws;
  };

  const unpairDevice = () => {
    Alert.alert(
      'Unpair Device',
      'Are you sure you want to disconnect from this computer?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Unpair',
          onPress: () => {
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({
                type: 'unpair',
                device_id: deviceInfo?.id
              }));
            }
            
            // Reset pairing state
            setPairingCode(null);
            setIsPaired(false);
            setDeviceInfo(null);
            
            // Close WebSocket
            if (socketRef.current) {
              socketRef.current.close();
            }
            
            // In a real app, remove stored credentials here
            
            Alert.alert('Device Unpaired', 'You have successfully disconnected from the computer.');
          },
          style: 'destructive'
        }
      ]
    );
  };

  // Render camera screen for QR scanning
  if (showCamera) {
    return (
      <ThemedView style={styles.container}>
        <CameraView
          style={styles.camera}
          facing={facing}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
        <TouchableOpacity style={styles.button} onPress={() => setShowCamera(false)}>
          <ThemedText style={styles.buttonText}>Cancel</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  // Render main screen
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.headerImage}
        />
      }
    >
      <ThemedView style={styles.container}>
        {/* Header with title and connection status */}
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">EcoSync</ThemedText>
          <View style={styles.statusIndicator}>
            <View 
              style={[
                styles.statusDot, 
                { 
                  backgroundColor: 
                    socketStatus === 'connected' ? '#4CD964' : 
                    socketStatus === 'connecting' ? '#FFCC00' : 
                    '#FF3B30' 
                }
              ]} 
            />
            <ThemedText style={styles.statusText}>
              {
                socketStatus === 'connected' ? 'Connected' : 
                socketStatus === 'connecting' ? 'Connecting...' : 
                'Disconnected'
              }
            </ThemedText>
          </View>
        </ThemedView>

        {/* Pairing section */}
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Device Pairing</ThemedText>
          
          {isPaired ? (
            <>
              <View style={styles.pairedContainer}>
                <IconSymbol 
                  name="checkmark.circle" 
                  size={50} 
                  color="#4CD964" 
                />
                <ThemedText style={styles.pairedText}>
                  Connected to Ubuntu PC
                </ThemedText>
                {pairingCode && (
                  <ThemedText style={styles.codeText}>
                    Pairing code: {pairingCode}
                  </ThemedText>
                )}
              </View>
              
              <TouchableOpacity 
                style={[styles.button, styles.unpairButton]}
                onPress={unpairDevice}
              >
                <ThemedText style={styles.buttonText}>Disconnect</ThemedText>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ThemedText style={styles.cardText}>
                Scan the QR code displayed on your Ubuntu computer to connect your devices.
              </ThemedText>
              
              <TouchableOpacity 
                style={[styles.button, styles.scanButton]}
                onPress={() => {
                  setScanned(false);
                  setShowCamera(true);
                }}
              >
                <IconSymbol 
                  name="qrcode" 
                  size={20} 
                  color="#FFFFFF" 
                  style={styles.buttonIcon}
                />
                <ThemedText style={styles.buttonText}>Scan QR Code</ThemedText>
              </TouchableOpacity>
            </>
          )}
        </ThemedView>

        {/* Features section */}
        <ThemedText type="subtitle" style={styles.sectionTitle}>Features</ThemedText>
        
        <ThemedView style={styles.featuresContainer}>
          {/* Clipboard tile */}
          <TouchableOpacity 
            style={[styles.featureTile, { backgroundColor: colorScheme === 'dark' ? '#104E8B' : '#B8E6FF' }]} 
            onPress={() => router.push('/clipboard')}
            disabled={!isPaired}
          >
            <IconSymbol 
              name="doc.on.clipboard" 
              size={32} 
              color={Colors[colorScheme].text} 
            />
            <ThemedText style={styles.featureTitle}>Clipboard</ThemedText>
            <ThemedText style={styles.featureDescription}>
              Copy on one device, paste on another
            </ThemedText>
          </TouchableOpacity>
          
          {/* Notifications tile */}
          <TouchableOpacity 
            style={[styles.featureTile, { backgroundColor: colorScheme === 'dark' ? '#6B3900' : '#FFD7B8' }]} 
            onPress={() => router.push('/notifications')}
            disabled={!isPaired}
          >
            <IconSymbol 
              name="bell.fill" 
              size={32} 
              color={Colors[colorScheme].text} 
            />
            <ThemedText style={styles.featureTitle}>Notifications</ThemedText>
            <ThemedText style={styles.featureDescription}>
              View phone notifications on your PC
            </ThemedText>
          </TouchableOpacity>
          
          {/* File sharing tile */}
          <TouchableOpacity 
            style={[styles.featureTile, { backgroundColor: colorScheme === 'dark' ? '#1E3B1E' : '#D0F0C0' }]} 
            onPress={() => router.push('/files')}
            disabled={!isPaired}
          >
            <IconSymbol 
              name="folder.fill" 
              size={32} 
              color={Colors[colorScheme].text} 
            />
            <ThemedText style={styles.featureTitle}>File Sharing</ThemedText>
            <ThemedText style={styles.featureDescription}>
              Transfer files between devices
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>

        {/* About section */}
        <ThemedView style={styles.aboutSection}>
          <ThemedText style={styles.aboutTitle}>About EcoSync</ThemedText>
          <ThemedText style={styles.aboutText}>
            EcoSync creates a seamless connection between your Android device and Linux computer,
            enabling clipboard synchronization, notification mirroring, and file transfers - all
            without requiring internet connectivity.
          </ThemedText>
        </ThemedView>

      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
  },
  camera: {
    width: '100%',
    height: '80%',
  },
  headerImage: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
  },
  card: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardText: {
    marginVertical: 10,
    lineHeight: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  buttonIcon: {
    marginRight: 8,
  },
  scanButton: {
    backgroundColor: '#007AFF',
  },
  unpairButton: {
    backgroundColor: '#FF3B30',
  },
  pairedContainer: {
    alignItems: 'center',
    padding: 16,
  },
  pairedText: {
    fontSize: 18,
    marginTop: 16,
    fontWeight: '500',
  },
  codeText: {
    marginTop: 8,
    opacity: 0.7,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  featureTile: {
    width: '48%',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'flex-start',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    height: 140,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  featureDescription: {
    fontSize: 14,
    opacity: 0.8,
  },
  aboutSection: {
    marginBottom: 32,
  },
  aboutTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  aboutText: {
    lineHeight: 20,
    opacity: 0.8,
  },
});
