import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { getMessages, sendMessage } from '../../src/api/messages';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../src/api/notifications';
import { getCustomers } from '../../src/api/customers';
import { submitFeedback } from '../../src/api/feedback';
import { useAuthStore, selectIsAuthenticated } from '../../src/store/authStore';
import { useAppStore } from '../../src/store/appStore';
import { getCacheConfig } from '../../src/hooks/useCacheConfig';
import { CameraCapture, type CaptureResult } from '../../src/components/CameraCapture';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { Colors, FontSize, Spacing, BorderRadius } from '../../src/constants/colors';
import type { FeedbackType } from '../../src/types';

type Section = 'menu' | 'messages' | 'notifications' | 'profile' | 'feedback';

const FEEDBACK_TYPES: { label: string; value: FeedbackType; icon: string }[] = [
  { label: 'Quality', value: 'quality', icon: 'star-outline' },
  { label: 'Pricing', value: 'pricing', icon: 'pricetag-outline' },
  { label: 'Payments', value: 'payments', icon: 'card-outline' },
  { label: 'Delivery', value: 'delivery_time', icon: 'bicycle-outline' },
];

const RATING_LABELS: Record<number, string> = {
  1: '⭐ Very Poor',
  2: '⭐⭐ Poor',
  3: '⭐⭐⭐ Average',
  4: '⭐⭐⭐⭐ Good',
  5: '⭐⭐⭐⭐⭐ Excellent',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const queryClient = useQueryClient();
  const unreadNotifications = useAppStore((s) => s.unreadNotifications ?? 0);
  const unreadMessages = useAppStore((s) => s.unreadCount ?? 0);

  const [section, setSection] = useState<Section>('menu');
  const [messageText, setMessageText] = useState('');
  const messageListRef = useRef<FlatList>(null);

  // Feedback state
  const [feedbackCustomerSearch, setFeedbackCustomerSearch] = useState('');
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number; name: string } | null>(null);
  const [shopName, setShopName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [exactLocation, setExactLocation] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [feedbackPhone, setFeedbackPhone] = useState('');
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('quality');
  const [starRating, setStarRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<CaptureResult | null>(null);
  const [feedbackErrors, setFeedbackErrors] = useState<Record<string, string>>({});

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: customersData } = useQuery({
    queryKey: ['customers-search', feedbackCustomerSearch],
    queryFn: () => getCustomers({ search: feedbackCustomerSearch }),
    enabled: isAuthenticated && showCustomerDrop && feedbackCustomerSearch.length > 1,
  });

  const { data: messagesData, isLoading: msgsLoading, refetch: refetchMessages } = useQuery({
    queryKey: ['messages'],
    queryFn: getMessages,
    enabled: isAuthenticated && section === 'messages',
    ...getCacheConfig('messages'),
    refetchInterval: section === 'messages' ? 15_000 : false, // faster poll when viewing
  });

  const { data: notificationsData, isLoading: notifsLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(),
    enabled: isAuthenticated && section === 'notifications',
    ...getCacheConfig('notifications'),
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const { mutate: doSendMsg, isPending: sendPending } = useMutation({
    mutationFn: sendMessage,
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: (err: Error) => Toast.show({ type: 'error', text1: 'Send failed', text2: err.message }),
  });

  const { mutate: markAllRead, isPending: markingAll } = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
      Toast.show({ type: 'success', text1: 'All notifications marked as read' });
    },
  });

  const { mutate: markSingleRead } = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    },
  });

  const { mutate: doSubmitFeedback, isPending: feedbackPending } = useMutation({
    mutationFn: submitFeedback,
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Feedback submitted!', text2: 'Thank you for your report.' });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      resetFeedbackForm();
      setSection('menu');
    },
    onError: (err: Error) =>
      Toast.show({ type: 'error', text1: 'Submit failed', text2: err.message }),
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const resetFeedbackForm = useCallback(() => {
    setSelectedCustomer(null);
    setFeedbackCustomerSearch('');
    setShopName('');
    setContactPerson('');
    setExactLocation('');
    setFeedbackPhone('');
    setFeedbackType('quality');
    setStarRating(5);
    setFeedbackComment('');
    setCapturedPhoto(null);
    setFeedbackErrors({});
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  }, [logout, router]);

  const captureGps = useCallback(async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Location access denied' });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setExactLocation(`${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
      Toast.show({ type: 'success', text1: 'GPS location captured' });
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to get GPS location' });
    } finally {
      setGpsLoading(false);
    }
  }, []);

  const validateFeedback = useCallback(() => {
    const e: Record<string, string> = {};
    if (!selectedCustomer) e.customer = 'Select a customer';
    if (!shopName.trim()) e.shopName = 'Shop name required';
    if (!contactPerson.trim()) e.contactPerson = 'Contact person required';
    if (!exactLocation.trim()) e.exactLocation = 'Location required';
    if (!feedbackPhone.trim()) e.phone = 'Phone required';
    setFeedbackErrors(e);
    return Object.keys(e).length === 0;
  }, [selectedCustomer, shopName, contactPerson, exactLocation, feedbackPhone]);

  const handleSubmitFeedback = useCallback(() => {
    if (!validateFeedback()) {
      Toast.show({ type: 'error', text1: 'Please fill all required fields' });
      return;
    }
    doSubmitFeedback({
      customer_id: selectedCustomer!.id,
      shop_name: shopName.trim(),
      contact_person: contactPerson.trim(),
      exact_location: exactLocation.trim(),
      phone_number: feedbackPhone.trim(),
      feedback_type: feedbackType,
      rating: starRating,
      comment: feedbackComment.trim(),
      photo_uri: capturedPhoto?.uri,
      latitude: capturedPhoto?.latitude ?? undefined,
      longitude: capturedPhoto?.longitude ?? undefined,
    });
  }, [validateFeedback, doSubmitFeedback, selectedCustomer, shopName, contactPerson,
      exactLocation, feedbackPhone, feedbackType, starRating, feedbackComment, capturedPhoto]);

  // ─── Menu ─────────────────────────────────────────────────────────────────

  if (section === 'menu') {
    const menuItems = [
      { icon: 'chatbubbles-outline', label: 'Internal Messages', section: 'messages' as Section, count: unreadMessages || null, color: Colors.primary },
      { icon: 'notifications-outline', label: 'Notifications', section: 'notifications' as Section, count: unreadNotifications || null, color: Colors.warning },
      { icon: 'star-outline', label: 'Customer Feedback', section: 'feedback' as Section, count: null, color: Colors.secondary },
      { icon: 'person-outline', label: 'My Profile', section: 'profile' as Section, count: null, color: Colors.gray600 },
    ];

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>More</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* User card */}
          <Card style={styles.userCard}>
            <View style={styles.userRow}>
              <View style={[styles.userAvatar, user?.is_admin && { backgroundColor: Colors.primaryDark }]}>
                <Text style={styles.userAvatarText}>
                  {(user?.user?.first_name?.charAt(0) ?? user?.user?.username?.charAt(0) ?? 'U').toUpperCase()}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user?.user?.first_name} {user?.user?.last_name}
                </Text>
                <View style={styles.userRoleRow}>
                  <Ionicons
                    name={user?.is_admin ? 'shield-checkmark' : 'briefcase-outline'}
                    size={13}
                    color={user?.is_admin ? Colors.gold : Colors.primary}
                  />
                  <Text style={styles.userRole}>
                    {user?.is_admin ? 'Administrator' : 'Salesperson'}
                  </Text>
                </View>
                {user?.department && <Text style={styles.userDept}>{user.department}</Text>}
                {user?.user?.email && <Text style={styles.userEmail}>{user.user.email}</Text>}
              </View>
              {/* Tap avatar area to go to profile */}
              <TouchableOpacity
                onPress={() => setSection('profile')}
                style={styles.profileArrow}
                accessibilityLabel="View profile"
              >
                <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
              </TouchableOpacity>
            </View>
          </Card>

          {/* Menu items */}
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.menuItem}
              onPress={() => setSection(item.section)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}${item.count ? `, ${item.count} unread` : ''}`}
            >
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
                <Ionicons name={item.icon as any} size={22} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <View style={styles.menuRight}>
                {item.count ? (
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{item.count > 99 ? '99+' : item.count}</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
              </View>
            </TouchableOpacity>
          ))}

          {/* Sign out — with confirmation */}
          <TouchableOpacity
            style={[styles.menuItem, styles.logoutItem]}
            onPress={handleLogout}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <View style={[styles.menuIcon, { backgroundColor: Colors.errorSurface }]}>
              <Ionicons name="log-out-outline" size={22} color={Colors.error} />
            </View>
            <Text style={[styles.menuLabel, { color: Colors.error }]}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.error} />
          </TouchableOpacity>

          {/* App version */}
          <Text style={styles.versionText}>ZeliaOMS v1.0</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  if (section === 'messages') {
    const messages = messagesData?.results ?? [];
    const myUsername = user?.user?.username;

    return (
      <SafeAreaView style={styles.safe}>
        <SectionHeader
          title="Internal Messages"
          onBack={() => setSection('menu')}
          rightElement={
            <TouchableOpacity onPress={() => refetchMessages()} style={styles.headerActionBtn}>
              <Ionicons name="refresh-outline" size={20} color={Colors.white} />
            </TouchableOpacity>
          }
        />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {msgsLoading ? (
            <LoadingSpinner message="Loading messages..." />
          ) : (
            <FlatList
              ref={messageListRef}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={[styles.content, messages.length === 0 && { flex: 1 }]}
              inverted={messages.length > 0}
              ListEmptyComponent={
                <EmptyState
                  icon="chatbubbles-outline"
                  title="No Messages"
                  description="Start a broadcast message to all team members."
                />
              }
              renderItem={({ item }) => {
                const isMine = item.sender_name === myUsername;
                return (
                  <View style={[styles.msgBubble, isMine ? styles.msgBubbleOut : styles.msgBubbleIn]}>
                    {!isMine && (
                      <Text style={styles.msgSender}>{item.sender_name}</Text>
                    )}
                    <Text style={isMine ? styles.msgTextOut : styles.msgText}>
                      {item.message}
                    </Text>
                    <Text style={[styles.msgTime, isMine && { color: 'rgba(255,255,255,0.65)' }]}>
                      {format(new Date(item.created_at), 'HH:mm')}
                    </Text>
                  </View>
                );
              }}
            />
          )}

          <View style={styles.msgInputRow}>
            <TextInput
              style={styles.msgInput}
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
              {sendPending
                ? <Ionicons name="hourglass-outline" size={20} color={Colors.white} />
                : <Ionicons name="send" size={20} color={Colors.white} />
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  if (section === 'notifications') {
    const notifications = notificationsData?.results ?? [];
    const hasUnread = notifications.some((n) => !n.is_read);

    return (
      <SafeAreaView style={styles.safe}>
        <SectionHeader
          title="Notifications"
          onBack={() => setSection('menu')}
          rightElement={
            hasUnread ? (
              <TouchableOpacity
                onPress={() => markAllRead()}
                style={styles.headerActionBtn}
                disabled={markingAll}
                accessibilityLabel="Mark all as read"
              >
                <Text style={styles.markAllText}>
                  {markingAll ? 'Marking…' : 'Mark all read'}
                </Text>
              </TouchableOpacity>
            ) : undefined
          }
        />
        {notifsLoading ? (
          <LoadingSpinner message="Loading notifications..." />
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={[styles.content, notifications.length === 0 && { flex: 1 }]}
            ListEmptyComponent={
              <EmptyState
                icon="notifications-outline"
                title="All caught up!"
                description="No notifications yet."
              />
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={item.is_read ? 1 : 0.7}
                onPress={() => { if (!item.is_read) markSingleRead(item.id); }}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}${!item.is_read ? ', unread' : ''}`}
              >
                <Card style={[styles.notifCard, !item.is_read && styles.notifUnread]}>
                  <View style={styles.notifRow}>
                    <View style={[styles.notifIconWrap, { backgroundColor: getNotifColor(item.event_type) + '20' }]}>
                      <Ionicons name={getNotifIcon(item.event_type) as any} size={18} color={getNotifColor(item.event_type)} />
                    </View>
                    <View style={styles.notifBody}>
                      <Text style={[styles.notifTitle, !item.is_read && styles.notifTitleUnread]}>
                        {item.title}
                      </Text>
                      <Text style={[styles.notifMsg, !item.is_read && styles.notifMsgUnread]}>
                        {item.body}
                      </Text>
                      <Text style={styles.notifTime}>
                        {format(new Date(item.created_at), 'dd MMM, HH:mm')}
                      </Text>
                    </View>
                    {!item.is_read && <View style={styles.unreadDot} />}
                  </View>
                </Card>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  // ─── Feedback ─────────────────────────────────────────────────────────────

  if (section === 'feedback') {
    const completedFields = [selectedCustomer, shopName, contactPerson, exactLocation, feedbackPhone]
      .filter(Boolean).length;
    const totalRequired = 5;
    const progress = completedFields / totalRequired;

    return (
      <SafeAreaView style={styles.safe}>
        <SectionHeader
          title="Customer Feedback"
          onBack={() => {
            if (selectedCustomer || shopName || feedbackComment) {
              Alert.alert('Discard Feedback?', 'Your progress will be lost.', [
                { text: 'Keep editing', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: () => { resetFeedbackForm(); setSection('menu'); } },
              ]);
            } else {
              setSection('menu');
            }
          }}
        />

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Customer search */}
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>
              Customer <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.searchInput, feedbackErrors.customer && styles.inputError]}
              placeholder="Search by name or phone..."
              placeholderTextColor={Colors.gray400}
              value={selectedCustomer ? selectedCustomer.name : feedbackCustomerSearch}
              onChangeText={(v) => {
                setFeedbackCustomerSearch(v);
                setSelectedCustomer(null);
                setShowCustomerDrop(true);
              }}
            />
            {feedbackErrors.customer ? (
              <Text style={styles.errorText}>{feedbackErrors.customer}</Text>
            ) : null}

            {showCustomerDrop && !selectedCustomer && (customersData?.results?.length ?? 0) > 0 && (
              <View style={styles.dropdown}>
                {customersData!.results.slice(0, 6).map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.dropItem}
                    onPress={() => {
                      setSelectedCustomer({ id: c.id, name: `${c.first_name} ${c.last_name}` });
                      setFeedbackCustomerSearch(`${c.first_name} ${c.last_name}`);
                      setShowCustomerDrop(false);
                      setShopName(c.first_name || '');
                      setFeedbackPhone(c.phone_number || '');
                      setExactLocation(c.address || '');
                      // Clear any existing error
                      setFeedbackErrors((e) => { const n = { ...e }; delete n.customer; return n; });
                    }}
                  >
                    <Text style={styles.dropItemName}>{c.first_name} {c.last_name}</Text>
                    <Text style={styles.dropItemSub}>{c.phone_number} · {c.default_category}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedCustomer && (
              <View style={styles.selectedCustomerRow}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.selectedCustomerText}>{selectedCustomer.name}</Text>
                <TouchableOpacity onPress={() => { setSelectedCustomer(null); setFeedbackCustomerSearch(''); }}>
                  <Ionicons name="close-circle" size={16} color={Colors.gray400} />
                </TouchableOpacity>
              </View>
            )}
          </Card>

          {/* Visit details */}
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Visit Details</Text>
            <Input
              label="Shop Name"
              value={shopName}
              onChangeText={setShopName}
              leftIcon="storefront-outline"
              placeholder="Customer's shop name"
              error={feedbackErrors.shopName}
              required
            />
            <Input
              label="Contact Person"
              value={contactPerson}
              onChangeText={setContactPerson}
              leftIcon="person-outline"
              placeholder="Name of person met"
              error={feedbackErrors.contactPerson}
              required
            />
            <Input
              label="Phone Number"
              value={feedbackPhone}
              onChangeText={setFeedbackPhone}
              leftIcon="call-outline"
              keyboardType="phone-pad"
              placeholder="0700000000"
              error={feedbackErrors.phone}
              required
            />
            {/* Location with GPS capture */}
            <View>
              <Input
                label="Location"
                value={exactLocation}
                onChangeText={setExactLocation}
                leftIcon="location-outline"
                placeholder="Street / area (or tap GPS)"
                error={feedbackErrors.exactLocation}
                required
              />
              <TouchableOpacity
                style={[styles.gpsBtn, gpsLoading && styles.gpsBtnLoading]}
                onPress={captureGps}
                disabled={gpsLoading}
                accessibilityLabel="Capture GPS location"
              >
                <Ionicons
                  name={gpsLoading ? 'hourglass-outline' : 'navigate-circle'}
                  size={16}
                  color={Colors.white}
                />
                <Text style={styles.gpsBtnText}>
                  {gpsLoading ? 'Getting GPS…' : 'Capture GPS Location'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>

          {/* Feedback type */}
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Feedback Type</Text>
            <View style={styles.feedbackTypeGrid}>
              {FEEDBACK_TYPES.map((ft) => (
                <TouchableOpacity
                  key={ft.value}
                  onPress={() => setFeedbackType(ft.value)}
                  style={[styles.feedbackTypePill, feedbackType === ft.value && styles.feedbackTypePillActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: feedbackType === ft.value }}
                >
                  <Ionicons
                    name={ft.icon as any}
                    size={16}
                    color={feedbackType === ft.value ? Colors.white : Colors.textSecondary}
                  />
                  <Text style={[styles.pillText, feedbackType === ft.value && styles.pillTextActive]}>
                    {ft.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          {/* Star rating */}
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Rating</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setStarRating(star)}
                  accessibilityLabel={`${star} star${star !== 1 ? 's' : ''}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: starRating === star }}
                >
                  <Ionicons
                    name={star <= starRating ? 'star' : 'star-outline'}
                    size={38}
                    color={star <= starRating ? '#FFC107' : Colors.gray300}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ratingLabel}>{RATING_LABELS[starRating]}</Text>
          </Card>

          {/* Comment */}
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Comment <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={[styles.searchInput, styles.commentInput]}
              placeholder="Additional observations or notes…"
              placeholderTextColor={Colors.gray400}
              value={feedbackComment}
              onChangeText={setFeedbackComment}
              multiline
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{feedbackComment.length}/500</Text>
          </Card>

          {/* Photo */}
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>
              Photo Evidence <Text style={styles.optional}>(optional)</Text>
            </Text>
            {capturedPhoto ? (
              <View style={styles.photoPreview}>
                <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
                <Text style={styles.photoPreviewText}>Photo captured ✓</Text>
                {capturedPhoto.latitude && (
                  <Text style={styles.gpsText}>
                    📍 {capturedPhoto.latitude.toFixed(5)}, {capturedPhoto.longitude?.toFixed(5)}
                  </Text>
                )}
                <Text style={styles.gpsText}>🕐 {capturedPhoto.timestamp}</Text>
                <TouchableOpacity
                  onPress={() => setCapturedPhoto(null)}
                  style={styles.retakeBtn}
                  accessibilityLabel="Retake photo"
                >
                  <Ionicons name="refresh-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.retakeText}>Retake</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Button
                label="Take Photo"
                variant="outline"
                icon="camera-outline"
                onPress={() => setCameraOpen(true)}
                fullWidth
              />
            )}
          </Card>

          <Button
            onPress={handleSubmitFeedback}
            label={feedbackPending ? 'Submitting…' : 'Submit Feedback'}
            variant="primary"
            size="lg"
            loading={feedbackPending}
            fullWidth
            style={styles.submitBtn}
          />
        </ScrollView>

        <CameraCapture
          visible={cameraOpen}
          username={user?.user?.username ?? 'user'}
          title="Capture Feedback Photo"
          facing="back"
          requireFace={false} // location photo, not a selfie
          onCapture={(result) => {
            setCapturedPhoto(result);
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      </SafeAreaView>
    );
  }

  // ─── Profile ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <SectionHeader title="My Profile" onBack={() => setSection('menu')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <Card style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={[styles.userAvatar, styles.userAvatarLarge, user?.is_admin && { backgroundColor: Colors.primaryDark }]}>
              <Text style={styles.userAvatarTextLarge}>
                {(user?.user?.first_name?.charAt(0) ?? 'U').toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userNameLarge} numberOfLines={1}>
                {user?.user?.first_name} {user?.user?.last_name}
              </Text>
              <Badge
                label={user?.is_admin ? 'Administrator' : 'Salesperson'}
                variant={user?.is_admin ? 'warning' : 'primary'}
              />
              {user?.department && <Text style={styles.userDept}>{user.department}</Text>}
            </View>
          </View>
        </Card>

        <Card style={styles.section}>
          <ProfileRow icon="person-outline" label="Username" value={user?.user?.username ?? '—'} />
          <ProfileRow icon="mail-outline" label="Email" value={user?.user?.email ?? '—'} />
          <ProfileRow icon="call-outline" label="Phone" value={user?.phone ?? '—'} />
          <ProfileRow icon="business-outline" label="Department" value={user?.department ?? '—'} />
          <ProfileRow icon="card-outline" label="National ID" value={user?.national_id ?? '—'} />
          <ProfileRow
            icon="calendar-outline"
            label="Join Date"
            value={user?.join_date ? format(new Date(user.join_date), 'dd MMM yyyy') : '—'}
          />
          <ProfileRow icon="person-circle-outline" label="Gender" value={user?.gender ?? '—'} />
        </Card>

        <Button
          onPress={handleLogout}
          label="Sign Out"
          variant="danger"
          icon="log-out-outline"
          fullWidth
          style={styles.submitBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  onBack,
  rightElement,
}: {
  title: string;
  onBack: () => void;
  rightElement?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <Ionicons name="arrow-back" size={22} color={Colors.white} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerRightSlot}>
        {rightElement ?? null}
      </View>
    </View>
  );
}

function ProfileRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.profileRow}>
      <Ionicons name={icon} size={16} color={Colors.primary} />
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function getNotifIcon(type: string): string {
  const map: Record<string, string> = {
    feedback_new: 'chatbox-outline',
    message_new: 'chatbubbles-outline',
    order_created: 'cart-outline',
    order_updated: 'pencil-outline',
    order_deleted: 'trash-outline',
    beat_visit: 'location-outline',
    beat_plan_new: 'calendar-outline',
    stock_change: 'layers-outline',
    payment_new: 'cash-outline',
    login_new: 'lock-closed-outline',
    general: 'notifications-outline',
  };
  return map[type] ?? 'notifications-outline';
}

function getNotifColor(type: string): string {
  const map: Record<string, string> = {
    feedback_new: Colors.secondary,
    message_new: Colors.primary,
    order_created: Colors.info,
    order_updated: Colors.info,
    order_deleted: Colors.error,
    beat_visit: Colors.primary,
    beat_plan_new: Colors.primary,
    stock_change: Colors.warning,
    payment_new: Colors.success,
    login_new: Colors.gray600,
    general: Colors.gray500,
  };
  return map[type] ?? Colors.gray500;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingTop: Spacing.lg,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.white, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  section: { marginBottom: Spacing.md },

  sectionHeaderRow: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerRightSlot: { width: 80, alignItems: 'flex-end' },
  headerActionBtn: { padding: Spacing.xs },
  markAllText: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '600' },

  // User card
  userCard: { marginBottom: Spacing.md },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarLarge: { width: 64, height: 64, borderRadius: 32 },
  userAvatarText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.primary },
  userAvatarTextLarge: { fontSize: FontSize.xxl ?? 28, fontWeight: '800', color: Colors.primary },
  userInfo: { flex: 1, gap: 3 },
  userName: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  userNameLarge: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  userRoleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  userRole: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  userDept: { fontSize: FontSize.xs, color: Colors.textSecondary },
  userEmail: { fontSize: FontSize.xs, color: Colors.textSecondary },
  profileArrow: { padding: Spacing.sm },

  // Menu
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  logoutItem: { marginTop: Spacing.sm },
  menuIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  versionText: { textAlign: 'center', fontSize: FontSize.xs, color: Colors.gray400, marginTop: Spacing.lg },

  // Messages
  msgBubble: {
    maxWidth: '80%',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  msgBubbleIn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.white,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  msgBubbleOut: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primary,
    borderTopRightRadius: 4,
  },
  msgSender: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  msgText: { fontSize: FontSize.md, color: Colors.textPrimary },
  msgTextOut: { fontSize: FontSize.md, color: Colors.white },
  msgTime: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4, alignSelf: 'flex-end' },
  msgInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    gap: Spacing.sm,
  },
  msgInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: Colors.gray300,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.gray400 },

  // Notifications
  notifCard: { marginBottom: Spacing.sm },
  notifUnread: { backgroundColor: Colors.primarySurface },
  notifRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  notifIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  notifBody: { flex: 1 },
  notifTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  notifTitleUnread: { fontWeight: '700' },
  notifMsg: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  notifMsgUnread: { fontWeight: '500', color: Colors.textPrimary },
  notifTime: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 4 },

  // Feedback
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm, marginTop: Spacing.xs },
  required: { color: Colors.error },
  optional: { fontSize: FontSize.xs, fontWeight: '400', color: Colors.textSecondary },
  progressBar: { height: 3, backgroundColor: Colors.gray200 },
  progressFill: { height: 3, backgroundColor: Colors.primary },
  searchInput: {
    borderWidth: 1.5,
    borderColor: Colors.gray300,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  commentInput: { minHeight: 80 },
  charCount: { fontSize: FontSize.xs, color: Colors.gray400, textAlign: 'right' },
  inputError: { borderColor: Colors.error },
  errorText: { fontSize: FontSize.xs, color: Colors.error, marginBottom: Spacing.xs },
  dropdown: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    marginBottom: Spacing.sm,
    maxHeight: 200,
    overflow: 'hidden',
  },
  dropItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  dropItemName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  dropItemSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  selectedCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.successSurface ?? Colors.gray100,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
  },
  selectedCustomerText: { flex: 1, fontSize: FontSize.sm, fontWeight: '600', color: Colors.success },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.info,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  gpsBtnLoading: { opacity: 0.7 },
  gpsBtnText: { color: Colors.white, fontWeight: '600', fontSize: FontSize.sm },
  feedbackTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  feedbackTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.gray300,
    backgroundColor: Colors.white,
  },
  feedbackTypePillActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  pillText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: Colors.white, fontWeight: '700' },
  starsRow: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center', paddingVertical: Spacing.md },
  ratingLabel: { textAlign: 'center', fontSize: FontSize.md, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.sm },
  photoPreview: {
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.successSurface ?? Colors.gray100,
    borderRadius: BorderRadius.md,
  },
  photoPreviewText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.success },
  gpsText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  retakeText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  submitBtn: { marginTop: Spacing.md },

  // Profile
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    gap: Spacing.md,
  },
  profileLabel: { width: 100, fontSize: FontSize.sm, color: Colors.textSecondary },
  profileValue: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '500' },
});
