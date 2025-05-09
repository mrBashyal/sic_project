import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, FlatList, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Permissions from 'expo-permissions';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// Get the WebSocket URL from the saved connection
const SOCKET_URL = 'ws://192.168.1.15:8000/ws';

type FileTransfer = {
  id: string;
  name: string;
  size: number;
  type: string;
  direction: 'upload' | 'download';
  progress: number;
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'canceled';
  timestamp: number;
};

type RemoteFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  timestamp: number;
};

export default function FilesScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [remoteFiles, setRemoteFiles] = useState<RemoteFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [storagePermission, setStoragePermission] = useState(false);
  
  const socketRef = useRef<WebSocket | null>(null);
  const fileChunksRef = useRef<{[key: string]: Blob[]}>({});

  // Connect to WebSocket when component mounts
  useEffect(() => {
    connectWebSocket();
    checkPermissions();
    
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const checkPermissions = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    setStoragePermission(status === 'granted');
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'File transfer requires storage permission to save downloaded files.',
        [{ text: 'OK' }]
      );
    }
  };

  const connectWebSocket = () => {
    const ws = new WebSocket(SOCKET_URL);

    ws.onopen = () => {
      console.log('WebSocket connected for file transfers');
      setConnectionStatus('connected');
      
      // Request available files from server
      ws.send(JSON.stringify({
        type: 'client_request',
        request: 'get_available_files'
      }));
      
      // Request active transfers
      ws.send(JSON.stringify({
        type: 'client_request',
        request: 'get_transfers'
      }));
    };

    ws.onmessage = async (event) => {
      try {
        // First try to parse as JSON
        try {
          const message = JSON.parse(event.data);
          
          // Handle file list from server
          if (message.type === 'available_files' && message.files) {
            const formattedFiles = message.files.map((f: any) => ({
              id: f.id || `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              name: f.name || 'Unknown File',
              size: f.size || 0,
              type: f.type || 'application/octet-stream',
              timestamp: f.timestamp || Date.now()
            }));
            
            setRemoteFiles(formattedFiles);
          }
          
          // Handle active transfers list
          else if (message.type === 'transfers' && message.transfers) {
            const formattedTransfers = message.transfers.map((t: any) => ({
              id: t.id || `transfer-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              name: t.name || 'Unknown File',
              size: t.size || 0,
              type: t.type || 'application/octet-stream',
              direction: t.direction || 'download',
              progress: t.progress || 0,
              status: t.status || 'pending',
              timestamp: t.timestamp || Date.now()
            }));
            
            setTransfers(formattedTransfers);
          }
          
          // Handle transfer update
          else if (message.type === 'transfer_update') {
            updateTransfer(message.transfer_id, {
              progress: message.progress,
              status: message.status
            });
            
            // If completed and it's a download, save the file
            if (message.status === 'completed' && message.direction === 'download') {
              saveCompletedFile(message.transfer_id, message.name);
            }
          }
          
          // Handle new file transfer request
          else if (message.type === 'file_transfer_request') {
            // Add to transfers list
            const newTransfer: FileTransfer = {
              id: message.transfer_id,
              name: message.file_name,
              size: message.file_size,
              type: message.file_type || 'application/octet-stream',
              direction: 'download',
              progress: 0,
              status: 'pending',
              timestamp: Date.now()
            };
            
            setTransfers(prev => [newTransfer, ...prev]);
            
            // Accept the transfer
            ws.send(JSON.stringify({
              type: 'file_transfer_response',
              transfer_id: message.transfer_id,
              accept: true
            }));
            
            // Initialize empty array for file chunks
            fileChunksRef.current[message.transfer_id] = [];
          }
          
          // Handle file chunk data
          else if (message.type === 'file_chunk' && message.transfer_id) {
            // Create a recipient for binary chunks
            if (!fileChunksRef.current[message.transfer_id]) {
              fileChunksRef.current[message.transfer_id] = [];
            }
            
            // We don't actually handle binary data here - that comes in the binary format
            // Just update progress
            updateTransfer(message.transfer_id, {
              progress: message.progress,
              status: 'transferring'
            });
          }
        } catch (e) {
          // If not JSON, it could be binary data for file transfer
          // We'd need to handle this differently with a proper binary protocol
          console.log('Received binary data or invalid JSON');
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket Error:', error);
      setConnectionStatus('disconnected');
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      setConnectionStatus('disconnected');
      
      // Try to reconnect after a delay
      setTimeout(() => {
        connectWebSocket();
      }, 5000);
    };

    socketRef.current = ws;
  };

  const updateTransfer = (id: string, updates: Partial<FileTransfer>) => {
    setTransfers(prev => 
      prev.map(transfer => 
        transfer.id === id
          ? { ...transfer, ...updates }
          : transfer
      )
    );
  };

  const saveCompletedFile = async (transferId: string, fileName: string) => {
    if (!storagePermission) {
      Alert.alert(
        'Permission Denied',
        'Cannot save file without storage permission.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      // In a real implementation, we'd create a file from the collected chunks
      // Here we're simulating this with a temporary file
      const fileUri = FileSystem.documentDirectory + fileName;
      
      // For demo purposes, we'll create an empty file
      await FileSystem.writeAsStringAsync(fileUri, 'Downloaded file content would go here');
      
      // Save to media library if it's a media file
      // For simplicity we'll save all files to downloads
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      
      Alert.alert(
        'File Downloaded',
        `${fileName} has been saved to your device.`,
        [{ text: 'OK' }]
      );
      
      // Clean up chunks
      delete fileChunksRef.current[transferId];
      
      // Update transfer status to reflect it's saved
      updateTransfer(transferId, { 
        status: 'completed',
        progress: 100
      });
    } catch (error) {
      console.error('Error saving file:', error);
      Alert.alert(
        'Save Failed',
        `Could not save ${fileName} to your device.`,
        [{ text: 'OK' }]
      );
    }
  };

  const initiateFileUpload = async () => {
    try {
      setIsLoading(true);
      
      // Pick a document
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });
      
      setIsLoading(false);
      
      if (result.canceled) {
        return;
      }
      
      const file = result.assets[0];
      
      if (!file || !file.uri) {
        Alert.alert('Error', 'No file selected');
        return;
      }
      
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        Alert.alert('Error', 'Not connected to server');
        return;
      }
      
      // Create a transfer ID
      const transferId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      // Create a transfer object
      const newTransfer: FileTransfer = {
        id: transferId,
        name: file.name,
        size: file.size,
        type: file.mimeType || 'application/octet-stream',
        direction: 'upload',
        progress: 0,
        status: 'pending',
        timestamp: Date.now()
      };
      
      // Add to transfers list
      setTransfers(prev => [newTransfer, ...prev]);
      
      // Send file transfer request to server
      socketRef.current.send(JSON.stringify({
        type: 'file_upload_request',
        transfer_id: transferId,
        file_name: file.name,
        file_size: file.size,
        file_type: file.mimeType
      }));
      
      // In a real implementation, we would now read the file and send it in chunks
      // For this example, we'll simulate progress
      simulateFileUpload(transferId, file);
      
    } catch (error) {
      setIsLoading(false);
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to select file');
    }
  };

  const simulateFileUpload = (transferId: string, file: DocumentPicker.DocumentPickerAsset) => {
    // For demo, we'll simulate file upload progress
    let progress = 0;
    updateTransfer(transferId, { status: 'transferring', progress });
    
    const interval = setInterval(() => {
      progress += 10;
      
      if (progress <= 100) {
        updateTransfer(transferId, { progress });
        
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          // Send progress update to server
          socketRef.current.send(JSON.stringify({
            type: 'upload_progress',
            transfer_id: transferId,
            progress
          }));
        }
      }
      
      if (progress >= 100) {
        clearInterval(interval);
        updateTransfer(transferId, { status: 'completed', progress: 100 });
        
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          // Notify server that upload is complete
          socketRef.current.send(JSON.stringify({
            type: 'upload_complete',
            transfer_id: transferId,
            file_name: file.name
          }));
        }
        
        // Request updated file list
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'client_request',
            request: 'get_available_files'
          }));
        }
      }
    }, 500);
  };

  const initiateFileDownload = (file: RemoteFile) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      Alert.alert('Error', 'Not connected to server');
      return;
    }
    
    // Create a transfer ID
    const transferId = `download-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Create a transfer object
    const newTransfer: FileTransfer = {
      id: transferId,
      name: file.name,
      size: file.size,
      type: file.type,
      direction: 'download',
      progress: 0,
      status: 'pending',
      timestamp: Date.now()
    };
    
    // Add to transfers list
    setTransfers(prev => [newTransfer, ...prev]);
    
    // Send download request to server
    socketRef.current.send(JSON.stringify({
      type: 'file_download_request',
      transfer_id: transferId,
      file_id: file.id
    }));
    
    // Initialize file chunks array
    fileChunksRef.current[transferId] = [];
    
    // For this example, we'll simulate progress
    simulateFileDownload(transferId, file);
  };

  const simulateFileDownload = (transferId: string, file: RemoteFile) => {
    // For demo, we'll simulate file download progress
    let progress = 0;
    updateTransfer(transferId, { status: 'transferring', progress });
    
    const interval = setInterval(() => {
      progress += 5;
      
      if (progress <= 100) {
        updateTransfer(transferId, { progress });
      }
      
      if (progress >= 100) {
        clearInterval(interval);
        updateTransfer(transferId, { status: 'completed', progress: 100 });
        saveCompletedFile(transferId, file.name);
      }
    }, 300);
  };

  const cancelTransfer = (id: string) => {
    Alert.alert(
      'Cancel Transfer',
      'Are you sure you want to cancel this transfer?',
      [
        {
          text: 'No',
          style: 'cancel'
        },
        {
          text: 'Yes',
          onPress: () => {
            // Update local state
            updateTransfer(id, { status: 'canceled' });
            
            // Notify server
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({
                type: 'cancel_transfer',
                transfer_id: id
              }));
            }
            
            // Clean up any chunks
            if (fileChunksRef.current[id]) {
              delete fileChunksRef.current[id];
            }
            
            // After a delay, remove from the list
            setTimeout(() => {
              setTransfers(prev => 
                prev.filter(transfer => transfer.id !== id)
              );
            }, 2000);
          }
        }
      ]
    );
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderTransferItem = ({ item }: { item: FileTransfer }) => {
    const isActiveTransfer = item.status === 'pending' || item.status === 'transferring';
    
    return (
      <ThemedView style={styles.transferItem}>
        <View style={styles.transferHeader}>
          <View style={styles.fileIconContainer}>
            <IconSymbol 
              name={item.direction === 'upload' ? 'arrow.up.doc.fill' : 'arrow.down.doc.fill'}
              size={24}
              color={
                item.status === 'completed' ? '#4CD964' :
                item.status === 'failed' ? '#FF3B30' :
                item.status === 'canceled' ? '#FF9500' : '#007AFF'
              }
            />
          </View>
          
          <View style={styles.fileDetails}>
            <ThemedText numberOfLines={1} style={styles.fileName}>
              {item.name}
            </ThemedText>
            <ThemedText style={styles.fileInfo}>
              {formatSize(item.size)} • {item.status}
            </ThemedText>
          </View>
          
          {isActiveTransfer && (
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={() => cancelTransfer(item.id)}
            >
              <IconSymbol 
                name="xmark.circle.fill" 
                size={22} 
                color="#FF3B30"
              />
            </TouchableOpacity>
          )}
        </View>
        
        {isActiveTransfer && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View 
                style={[styles.progressFill, { width: `${item.progress}%` }]}
              />
            </View>
            <ThemedText style={styles.progressText}>{item.progress}%</ThemedText>
          </View>
        )}
      </ThemedView>
    );
  };

  const renderFileItem = ({ item }: { item: RemoteFile }) => {
    return (
      <ThemedView style={styles.fileItem}>
        <View style={styles.fileHeader}>
          <View style={styles.fileIconContainer}>
            <IconSymbol 
              name="doc.fill"
              size={24}
              color="#007AFF"
            />
          </View>
          
          <View style={styles.fileDetails}>
            <ThemedText numberOfLines={1} style={styles.fileName}>
              {item.name}
            </ThemedText>
            <ThemedText style={styles.fileInfo}>
              {formatSize(item.size)} • {new Date(item.timestamp).toLocaleDateString()}
            </ThemedText>
          </View>
          
          <TouchableOpacity 
            style={styles.downloadButton} 
            onPress={() => initiateFileDownload(item)}
          >
            <IconSymbol 
              name="arrow.down.circle.fill" 
              size={28} 
              color="#007AFF"
            />
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0F0C0', dark: '#1E3B1E' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.headerImage}
        />
      }
    >
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <IconSymbol 
            name="folder.fill" 
            size={28} 
            color={Colors[colorScheme].text} 
            style={styles.titleIcon} 
          />
          <ThemedText type="title">File Sharing</ThemedText>
        </ThemedView>

        {/* Status Card */}
        <ThemedView style={styles.card}>
          <View style={styles.statusRow}>
            <ThemedText>Connection Status:</ThemedText>
            <View style={styles.statusIndicator}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: connectionStatus === 'connected' ? '#4CD964' : '#FF3B30' }
              ]} />
              <ThemedText>{connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}</ThemedText>
            </View>
          </View>

          <TouchableOpacity 
            style={[
              styles.uploadButton,
              (!storagePermission || connectionStatus !== 'connected') && styles.disabledButton
            ]}
            disabled={!storagePermission || connectionStatus !== 'connected'}
            onPress={initiateFileUpload}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <IconSymbol name="arrow.up.doc" size={20} color="#FFFFFF" style={styles.uploadIcon} />
                <ThemedText style={styles.uploadButtonText}>Upload File</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </ThemedView>

        {/* Active Transfers */}
        <ThemedView style={styles.sectionContainer}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Active Transfers
          </ThemedText>
          
          {transfers.length > 0 ? (
            <FlatList
              data={transfers.filter(t => t.status !== 'completed' && t.status !== 'canceled')}
              renderItem={renderTransferItem}
              keyExtractor={item => item.id}
              style={styles.transfersList}
              ListEmptyComponent={
                <ThemedText style={styles.emptyText}>No active transfers</ThemedText>
              }
            />
          ) : (
            <ThemedText style={styles.emptyText}>No active transfers</ThemedText>
          )}
        </ThemedView>

        {/* Files on Server */}
        <ThemedView style={styles.sectionContainer}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Available Files
          </ThemedText>
          
          {remoteFiles.length > 0 ? (
            <FlatList
              data={remoteFiles}
              renderItem={renderFileItem}
              keyExtractor={item => item.id}
              style={styles.filesList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <IconSymbol 
                    name="folder.badge.questionmark" 
                    size={50} 
                    color={Colors[colorScheme].text} 
                    style={{ opacity: 0.5 }}
                  />
                  <ThemedText style={styles.emptyText}>No files available</ThemedText>
                </View>
              }
            />
          ) : (
            <View style={styles.emptyContainer}>
              <IconSymbol 
                name="folder.badge.questionmark" 
                size={50} 
                color={Colors[colorScheme].text} 
                style={{ opacity: 0.5 }}
              />
              <ThemedText style={styles.emptyText}>No files available</ThemedText>
            </View>
          )}
        </ThemedView>

        {/* Completed Transfers */}
        {transfers.filter(t => t.status === 'completed').length > 0 && (
          <ThemedView style={styles.sectionContainer}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Completed Transfers
            </ThemedText>
            
            <FlatList
              data={transfers.filter(t => t.status === 'completed')}
              renderItem={renderTransferItem}
              keyExtractor={item => item.id}
              style={styles.transfersList}
            />
          </ThemedView>
        )}
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
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
    marginBottom: 10,
  },
  titleIcon: {
    marginRight: 8,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 4,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  uploadButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    backgroundColor: '#999',
    opacity: 0.7,
  },
  uploadIcon: {
    marginRight: 8,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  sectionContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  transfersList: {
    maxHeight: 250,
  },
  filesList: {
    maxHeight: 300,
  },
  transferItem: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  transferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
  },
  fileDetails: {
    flex: 1,
    paddingHorizontal: 10,
  },
  fileName: {
    fontWeight: '600',
    marginBottom: 3,
  },
  fileInfo: {
    fontSize: 12,
    opacity: 0.7,
  },
  cancelButton: {
    padding: 4,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingLeft: 40,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  progressText: {
    marginLeft: 8,
    fontSize: 12,
    width: 40,
    textAlign: 'right',
  },
  fileItem: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  downloadButton: {
    padding: 4,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.5,
    marginTop: 8,
    marginBottom: 8,
  },
});