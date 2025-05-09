import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Switch, TouchableOpacity, View, FlatList, Alert } from 'react-native';
import { Image } from 'expo-image';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// Get the WebSocket URL from the saved connection
const SOCKET_URL = 'ws://192.168.1.15:8000/ws';

type Notification = {
  id: string;
  app: string;
  title: string;
  content: string;
  timestamp: number;
  icon?: string;
  isRead: boolean;
};

export default function NotificationsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const [isEnabled, setIsEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  
  const socketRef = useRef<WebSocket | null>(null);

  // Connect to WebSocket when component mounts
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  // Filter notifications based on current filter setting
  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => !n.isRead);

  const connectWebSocket = () => {
    const ws = new WebSocket(SOCKET_URL);

    ws.onopen = () => {
      console.log('WebSocket connected for notifications');
      setConnectionStatus('connected');
      
      // Request any stored notifications on connect
      ws.send(JSON.stringify({
        type: 'client_request',
        request: 'get_notifications'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle new notification from server
        if (message.type === 'notification' && isEnabled) {
          const newNotification: Notification = {
            id: message.id || `notification-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            app: message.app_name || 'Unknown App',
            title: message.title || 'Notification',
            content: message.content || '',
            timestamp: message.timestamp || Date.now(),
            icon: message.icon_data,
            isRead: false
          };
          
          // Add new notification at the beginning of the list
          setNotifications(prev => [newNotification, ...prev]);
        }
        
        // Handle stored notifications from server
        else if (message.type === 'stored_notifications' && message.notifications) {
          const formattedNotifications = message.notifications.map((n: any) => ({
            id: n.id || `notification-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            app: n.app_name || 'Unknown App',
            title: n.title || 'Notification',
            content: n.content || '',
            timestamp: n.timestamp || Date.now(),
            icon: n.icon_data,
            isRead: n.is_read || false
          }));
          
          setNotifications(formattedNotifications);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
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
        if (isEnabled) {
          connectWebSocket();
        }
      }, 5000);
    };

    socketRef.current = ws;
  };

  const toggleSwitch = () => {
    const newValue = !isEnabled;
    setIsEnabled(newValue);
    
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      // Notify the server about the setting change
      socketRef.current.send(JSON.stringify({
        type: 'client_setting',
        setting: 'notification_mirroring',
        value: newValue
      }));
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id
          ? { ...notification, isRead: true }
          : notification
      )
    );

    // Notify the server that notification was read
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'notification_action',
        action: 'mark_read',
        notification_id: id
      }));
    }
  };

  const clearAllNotifications = () => {
    Alert.alert(
      'Clear Notifications',
      'Are you sure you want to clear all notifications?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Clear All',
          onPress: () => {
            setNotifications([]);
            
            // Notify the server to clear notifications
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({
                type: 'notification_action',
                action: 'clear_all'
              }));
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.round(diffMs / 60000);
    const diffHr = Math.round(diffMs / 3600000);
    
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    
    return date.toLocaleDateString();
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    return (
      <TouchableOpacity 
        style={[
          styles.notificationItem, 
          { opacity: item.isRead ? 0.7 : 1 }
        ]}
        onPress={() => markAsRead(item.id)}
      >
        <View style={styles.notificationHeader}>
          <ThemedText style={styles.appName}>{item.app}</ThemedText>
          <ThemedText style={styles.timestamp}>{formatTimestamp(item.timestamp)}</ThemedText>
        </View>
        
        <ThemedText style={styles.notificationTitle} type="defaultSemiBold">
          {item.title}
        </ThemedText>
        
        <ThemedText numberOfLines={3} ellipsizeMode="tail">
          {item.content}
        </ThemedText>
        
        {!item.isRead && (
          <View style={styles.unreadIndicator} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#FFD7B8', dark: '#6B3900' }}
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
            name="bell.fill" 
            size={28} 
            color={Colors[colorScheme].text} 
            style={styles.titleIcon} 
          />
          <ThemedText type="title">Notifications</ThemedText>
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

          <View style={styles.statusRow}>
            <ThemedText>Notification Mirroring:</ThemedText>
            <Switch
              trackColor={{ false: "#767577", true: "#81b0ff" }}
              thumbColor={isEnabled ? "#f5dd4b" : "#f4f3f4"}
              ios_backgroundColor="#3e3e3e"
              onValueChange={toggleSwitch}
              value={isEnabled}
            />
          </View>
        </ThemedView>

        {/* Filter and Clear */}
        <ThemedView style={styles.filterContainer}>
          <View style={styles.filterButtons}>
            <TouchableOpacity 
              style={[
                styles.filterButton, 
                filter === 'all' && styles.filterButtonActive
              ]}
              onPress={() => setFilter('all')}
            >
              <ThemedText style={filter === 'all' ? styles.filterTextActive : {}}>All</ThemedText>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.filterButton, 
                filter === 'unread' && styles.filterButtonActive
              ]}
              onPress={() => setFilter('unread')}
            >
              <ThemedText style={filter === 'unread' ? styles.filterTextActive : {}}>Unread</ThemedText>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={styles.clearButton}
            onPress={clearAllNotifications}
          >
            <ThemedText style={styles.clearButtonText}>Clear All</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        {/* Notifications List */}
        <ThemedView style={styles.notificationsContainer}>
          {filteredNotifications.length > 0 ? (
            <FlatList
              data={filteredNotifications}
              renderItem={renderNotification}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.notificationsList}
              style={{ height: 500 }}
            />
          ) : (
            <ThemedView style={styles.emptyContainer}>
              <IconSymbol 
                name="bell.slash" 
                size={60} 
                color={Colors[colorScheme].text} 
                style={{ opacity: 0.5 }}
              />
              <ThemedText style={styles.emptyText}>No notifications</ThemedText>
            </ThemedView>
          )}
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
    marginBottom: 12,
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
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterButtons: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterTextActive: {
    color: '#fff',
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  clearButtonText: {
    color: '#FF3B30',
  },
  notificationsContainer: {
    flex: 1,
    marginBottom: 20,
  },
  notificationsList: {
    paddingBottom: 20,
  },
  notificationItem: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    position: 'relative',
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  appName: {
    fontSize: 12,
    opacity: 0.7,
  },
  timestamp: {
    fontSize: 12,
    opacity: 0.7,
  },
  notificationTitle: {
    marginBottom: 4,
  },
  unreadIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 50,
  },
  emptyText: {
    marginTop: 16,
    opacity: 0.5,
    textAlign: 'center',
  },
});