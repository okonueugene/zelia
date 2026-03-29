import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { getMessages, sendMessage } from '../../../src/api/messages';
import { useAuthStore, selectIsAuthenticated } from '../../../src/store/authStore';
import { getCacheConfig } from '../../../src/hooks/useCacheConfig';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Colors, FontSize, Spacing, BorderRadius } from '../../../src/constants/colors';

export default function MessagesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const [messageText, setMessageText] = useState('');
  const listRef = useRef<FlatList>(null);

  const { data: messagesData, isLoading, refetch } = useQuery({
    queryKey: ['messages'],
    queryFn: getMessages,
    enabled: isAuthenticated,
    ...getCacheConfig('messages'),
    refetchInterval: 15_000,
  });
  const messages = messagesData?.results ?? [];

  const { mutate: doSendMsg, isPending: sendPending } = useMutation({
    mutationFn: sendMessage,
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: (err: Error) => Toast.show({ type: 'error', text1: 'Send failed', text2: err.message }),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Internal Messages</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.headerBtn} accessibilityLabel="Refresh messages">
          <Ionicons name="refresh-outline" size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {isLoading ? (
          <LoadingSpinner message="Loading messages..." />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={[styles.list, messages.length === 0 && { flex: 1 }]}
            inverted={messages.length > 0}
            ListEmptyComponent={
              <EmptyState
                icon="chatbubbles-outline"
                title="No Messages"
                description="Start a broadcast message to all team members."
              />
            }
            renderItem={({ item }) => {
              const isMine = item.sender_name === user?.user?.username;
              return (
                <View style={[styles.bubble, isMine ? styles.bubbleOut : styles.bubbleIn]}>
                  {!isMine && <Text style={styles.sender}>{item.sender_name}</Text>}
                  <Text style={isMine ? styles.textOut : styles.textIn}>{item.message}</Text>
                  <Text style={[styles.time, isMine && { color: 'rgba(255,255,255,0.65)' }]}>
                    {format(new Date(item.created_at), 'HH:mm')}
                  </Text>
                </View>
              );
            }}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Broadcast to all team members..."
            placeholderTextColor={Colors.gray400}
            value={messageText}
            onChangeText={setMessageText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!messageText.trim() || sendPending) && styles.sendBtnDisabled]}
            onPress={() => { if (messageText.trim()) doSendMsg({ message: messageText.trim() }); }}
            disabled={!messageText.trim() || sendPending}
            accessibilityLabel="Send message"
          >
            <Ionicons
              name={sendPending ? 'hourglass-outline' : 'send'}
              size={20}
              color={Colors.white}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg, paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.md, paddingBottom: Spacing.sm },

  bubble: { maxWidth: '80%', padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.sm },
  bubbleIn: {
    alignSelf: 'flex-start', backgroundColor: Colors.white,
    borderTopLeftRadius: 4, borderWidth: 1, borderColor: Colors.gray200,
  },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: Colors.primary, borderTopRightRadius: 4 },
  sender: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  textIn: { fontSize: FontSize.md, color: Colors.textPrimary },
  textOut: { fontSize: FontSize.md, color: Colors.white },
  time: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4, alignSelf: 'flex-end' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.gray200,
    gap: Spacing.sm,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    borderWidth: 1.5, borderColor: Colors.gray300, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.md, color: Colors.textPrimary,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.gray400 },
});
