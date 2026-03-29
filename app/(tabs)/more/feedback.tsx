/**
 * Customer Feedback – 4-step wizard
 *
 * Step 1 – Customer selection
 * Step 2 – Visit details (shop, contact, phone, GPS location)
 * Step 3 – Rating + type + comment
 * Step 4 – Photo evidence (optional) + submit
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import Toast from 'react-native-toast-message';
import { getCustomers } from '../../../src/api/customers';
import { submitFeedback } from '../../../src/api/feedback';
import { useAuthStore, selectIsAuthenticated } from '../../../src/store/authStore';
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue';
import { normalizeSearchQuery } from '../../../src/utils/search';
import { CameraCapture, type CaptureResult } from '../../../src/components/CameraCapture';
import { Card } from '../../../src/components/ui/Card';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Input';
import { Colors, FontSize, Spacing, BorderRadius } from '../../../src/constants/colors';
import type { FeedbackType } from '../../../src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

const FEEDBACK_TYPES: { label: string; value: FeedbackType; icon: string }[] = [
  { label: 'Quality',  value: 'quality',       icon: 'star-outline'    },
  { label: 'Pricing',  value: 'pricing',        icon: 'pricetag-outline'},
  { label: 'Payments', value: 'payments',       icon: 'card-outline'    },
  { label: 'Delivery', value: 'delivery_time',  icon: 'bicycle-outline' },
];

const RATING_LABELS: Record<number, string> = {
  1: 'Very Poor', 2: 'Poor', 3: 'Average', 4: 'Good', 5: 'Excellent',
};

const STEP_TITLES = ['Customer', 'Visit Details', 'Rating & Feedback', 'Photo & Submit'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function FeedbackWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // Step 1 – Customer
  const [customerSearch, setCustomerSearch, debouncedSearch] = useDebouncedValue('', 300);
  const [showDrop, setShowDrop] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number; name: string } | null>(null);

  // Step 2 – Visit details
  const [shopName, setShopName]             = useState('');
  const [contactPerson, setContactPerson]   = useState('');
  const [feedbackPhone, setFeedbackPhone]   = useState('');
  const [exactLocation, setExactLocation]   = useState('');
  const [feedbackGps, setFeedbackGps]       = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading]         = useState(false);

  // Step 3 – Rating
  const [feedbackType, setFeedbackType]     = useState<FeedbackType>('quality');
  const [starRating, setStarRating]         = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');

  // Step 4 – Photo
  const [cameraOpen, setCameraOpen]         = useState(false);
  const [capturedPhoto, setCapturedPhoto]   = useState<CaptureResult | null>(null);
  const [readingPhoto, setReadingPhoto]     = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Customer search query ─────────────────────────────────────────────────
  const searchParam = useMemo(
    () => (debouncedSearch.trim() ? normalizeSearchQuery(debouncedSearch) : ''),
    [debouncedSearch],
  );

  const { data: customersData, isFetching: searchFetching } = useQuery({
    queryKey: ['customers-search', searchParam],
    queryFn: () => getCustomers({ search: searchParam }),
    enabled: isAuthenticated && showDrop && searchParam.length >= 1,
  });

  // ── Submit mutation ───────────────────────────────────────────────────────
  const { mutate: doSubmit, isPending: submitPending } = useMutation({
    mutationFn: submitFeedback,
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Feedback submitted!', text2: 'Thank you for your report.' });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      router.back();
    },
    onError: (err: Error) =>
      Toast.show({ type: 'error', text1: 'Submit failed', text2: err.message }),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const captureGps = useCallback(async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Location access denied' });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = loc.coords;
      setFeedbackGps({ lat, lng });
      setExactLocation(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      Toast.show({ type: 'success', text1: 'GPS captured' });
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to get GPS location' });
    } finally {
      setGpsLoading(false);
    }
  }, []);

  const validateStep = useCallback(
    (s: number): boolean => {
      const e: Record<string, string> = {};
      if (s === 1 && !selectedCustomer) e.customer = 'Select a customer to continue';
      if (s === 2) {
        if (!shopName.trim())       e.shopName      = 'Shop name required';
        if (!contactPerson.trim())  e.contactPerson = 'Contact person required';
        if (!feedbackPhone.trim())  e.phone         = 'Phone required';
        if (!exactLocation.trim())  e.location      = 'Location required';
      }
      setErrors(e);
      return Object.keys(e).length === 0;
    },
    [selectedCustomer, shopName, contactPerson, feedbackPhone, exactLocation],
  );

  const goNext = useCallback(() => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }, [step, validateStep]);

  const goBack = useCallback(() => {
    if (step === 1) {
      const hasData = selectedCustomer || shopName || feedbackComment;
      if (hasData) {
        Alert.alert('Discard feedback?', 'Your progress will be lost.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ]);
      } else {
        router.back();
      }
    } else {
      setStep((s) => s - 1);
    }
  }, [step, selectedCustomer, shopName, feedbackComment, router]);

  const handleSubmit = useCallback(async () => {
    let photo_base64: string | undefined;
    if (capturedPhoto?.uri) {
      setReadingPhoto(true);
      try {
        photo_base64 = await FileSystem.readAsStringAsync(capturedPhoto.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (photo_base64.length > 6_000_000) {
          Toast.show({ type: 'error', text1: 'Photo too large', text2: 'Please retake with a smaller image.' });
          return;
        }
      } catch {
        Toast.show({ type: 'error', text1: 'Could not read photo file' });
        return;
      } finally {
        setReadingPhoto(false);
      }
    }

    const lat = capturedPhoto?.latitude ?? feedbackGps?.lat;
    const lng = capturedPhoto?.longitude ?? feedbackGps?.lng;

    doSubmit({
      customer_id:    selectedCustomer!.id,
      shop_name:      shopName.trim(),
      contact_person: contactPerson.trim(),
      exact_location: exactLocation.trim(),
      phone_number:   feedbackPhone.trim(),
      feedback_type:  feedbackType,
      rating:         starRating,
      comment:        feedbackComment.trim(),
      photo_base64,
      latitude:  lat,
      longitude: lng,
    });
  }, [
    capturedPhoto, feedbackGps, selectedCustomer, shopName, contactPerson,
    exactLocation, feedbackPhone, feedbackType, starRating, feedbackComment, doSubmit,
  ]);

  // ── Progress ──────────────────────────────────────────────────────────────
  const progress = step / TOTAL_STEPS;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Customer Feedback</Text>
          <Text style={styles.headerSub}>Step {step} of {TOTAL_STEPS} · {STEP_TITLES[step - 1]}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
      </View>

      {/* Step dots */}
      <View style={styles.dotRow}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i + 1 <= step ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>

      {/* ── Step 1: Customer selection ─────────────────────────────────────── */}
      {step === 1 && (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Search Customer</Text>
            <Text style={styles.cardSubtitle}>Find the customer you visited today.</Text>

            <TextInput
              style={[styles.searchBox, errors.customer && styles.inputError]}
              placeholder="Type name or phone…"
              placeholderTextColor={Colors.gray400}
              value={selectedCustomer ? selectedCustomer.name : customerSearch}
              onChangeText={(v) => {
                setCustomerSearch(v);
                setSelectedCustomer(null);
                setShowDrop(true);
                setErrors((e) => { const n = { ...e }; delete n.customer; return n; });
              }}
              autoCapitalize="words"
            />
            {errors.customer ? <Text style={styles.errText}>{errors.customer}</Text> : null}

            {/* Dropdown */}
            {showDrop && !selectedCustomer && searchParam.length >= 1 && (
              <View style={styles.dropdown}>
                {searchFetching ? (
                  <View style={styles.dropRow}>
                    <Ionicons name="hourglass-outline" size={14} color={Colors.gray400} />
                    <Text style={styles.dropSub}>Searching…</Text>
                  </View>
                ) : (customersData?.results?.length ?? 0) > 0 ? (
                  customersData!.results.slice(0, 7).map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.dropItem}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${c.first_name} ${c.last_name}`}
                      onPress={() => {
                        setSelectedCustomer({ id: c.id, name: `${c.first_name} ${c.last_name}` });
                        setCustomerSearch(`${c.first_name} ${c.last_name}`);
                        setShowDrop(false);
                        setShopName(c.first_name || '');
                        setFeedbackPhone(c.phone_number || '');
                        setExactLocation(c.address || '');
                      }}
                    >
                      <View style={styles.dropItemInner}>
                        <View style={styles.dropAvatar}>
                          <Text style={styles.dropAvatarText}>
                            {c.first_name?.charAt(0).toUpperCase() ?? '?'}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.dropName}>{c.first_name} {c.last_name}</Text>
                          <Text style={styles.dropSub}>{c.phone_number} · {c.default_category}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.dropRow}>
                    <Ionicons name="search-outline" size={14} color={Colors.gray400} />
                    <Text style={styles.dropSub}>No customers match &quot;{debouncedSearch.trim()}&quot;</Text>
                  </View>
                )}
              </View>
            )}

            {/* Selected badge */}
            {selectedCustomer && (
              <View style={styles.selectedBadge}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                <Text style={styles.selectedText}>{selectedCustomer.name}</Text>
                <TouchableOpacity
                  onPress={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
                  accessibilityLabel="Clear selected customer"
                >
                  <Ionicons name="close-circle" size={18} color={Colors.gray400} />
                </TouchableOpacity>
              </View>
            )}
          </Card>

          <WizardFooter step={step} onBack={goBack} onNext={goNext} />
        </ScrollView>
      )}

      {/* ── Step 2: Visit details ──────────────────────────────────────────── */}
      {step === 2 && (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Visit Details</Text>
            <Text style={styles.cardSubtitle}>Tell us about the shop you visited.</Text>

            <Input
              label="Shop Name"
              value={shopName}
              onChangeText={setShopName}
              leftIcon="storefront-outline"
              placeholder="e.g. Mama Mboga Shop"
              error={errors.shopName}
              required
            />
            <Input
              label="Contact Person"
              value={contactPerson}
              onChangeText={setContactPerson}
              leftIcon="person-outline"
              placeholder="Name of person you met"
              error={errors.contactPerson}
              required
            />
            <Input
              label="Phone Number"
              value={feedbackPhone}
              onChangeText={setFeedbackPhone}
              leftIcon="call-outline"
              keyboardType="phone-pad"
              placeholder="0700 000 000"
              error={errors.phone}
              required
            />
            <Input
              label="Location / Address"
              value={exactLocation}
              onChangeText={setExactLocation}
              leftIcon="location-outline"
              placeholder="Street or area (or use GPS)"
              error={errors.location}
              required
            />
            <TouchableOpacity
              style={[styles.gpsBtn, gpsLoading && styles.gpsBtnLoading]}
              onPress={captureGps}
              disabled={gpsLoading}
              accessibilityLabel="Capture GPS location"
            >
              <Ionicons name={gpsLoading ? 'hourglass-outline' : 'navigate-circle'} size={16} color={Colors.white} />
              <Text style={styles.gpsBtnText}>{gpsLoading ? 'Getting GPS…' : 'Use GPS Location'}</Text>
            </TouchableOpacity>
          </Card>

          <WizardFooter step={step} onBack={goBack} onNext={goNext} />
        </ScrollView>
      )}

      {/* ── Step 3: Rating & feedback ──────────────────────────────────────── */}
      {step === 3 && (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Feedback type pills */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Feedback Type</Text>
            <View style={styles.pillRow}>
              {FEEDBACK_TYPES.map((ft) => (
                <TouchableOpacity
                  key={ft.value}
                  onPress={() => setFeedbackType(ft.value)}
                  style={[styles.pill, feedbackType === ft.value && styles.pillActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: feedbackType === ft.value }}
                >
                  <Ionicons
                    name={ft.icon as any}
                    size={15}
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
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Overall Rating</Text>
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
                    size={40}
                    color={star <= starRating ? '#FFC107' : Colors.gray300}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ratingLabel}>{RATING_LABELS[starRating]}</Text>
          </Card>

          {/* Comment */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>
              Comment <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.commentBox}
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

          <WizardFooter step={step} onBack={goBack} onNext={goNext} />
        </ScrollView>
      )}

      {/* ── Step 4: Photo + submit ─────────────────────────────────────────── */}
      {step === 4 && (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>
              Photo Evidence <Text style={styles.optional}>(optional)</Text>
            </Text>
            <Text style={styles.cardSubtitle}>
              Take a photo of the shop, shelves, or anything relevant.
            </Text>

            {capturedPhoto ? (
              <View style={styles.photoPreview}>
                <Ionicons name="checkmark-circle" size={32} color={Colors.success} />
                <Text style={styles.photoOk}>Photo captured ✓</Text>
                {capturedPhoto.latitude && (
                  <Text style={styles.metaText}>
                    📍 {capturedPhoto.latitude.toFixed(5)}, {capturedPhoto.longitude?.toFixed(5)}
                  </Text>
                )}
                <Text style={styles.metaText}>🕐 {capturedPhoto.timestamp}</Text>
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

          {/* Summary recap */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Summary</Text>
            <RecapRow icon="person-circle-outline"  label="Customer"   value={selectedCustomer?.name ?? '—'} />
            <RecapRow icon="storefront-outline"      label="Shop"       value={shopName || '—'} />
            <RecapRow icon="location-outline"        label="Location"   value={exactLocation || '—'} />
            <RecapRow icon="star-outline"            label="Rating"     value={`${starRating}/5 – ${RATING_LABELS[starRating]}`} />
            <RecapRow icon="pricetag-outline"        label="Type"       value={FEEDBACK_TYPES.find(f => f.value === feedbackType)?.label ?? feedbackType} />
          </Card>

          <Button
            onPress={handleSubmit}
            label={readingPhoto ? 'Preparing photo…' : submitPending ? 'Submitting…' : 'Submit Feedback'}
            variant="primary"
            size="lg"
            loading={submitPending || readingPhoto}
            fullWidth
            style={styles.submitBtn}
          />

          {/* Back only — no "Next" on final step */}
          <TouchableOpacity style={styles.backTextBtn} onPress={goBack}>
            <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
            <Text style={styles.backTextLabel}>Back to rating</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Camera */}
      <CameraCapture
        visible={cameraOpen}
        username={user?.user?.username ?? 'user'}
        title="Capture Feedback Photo"
        facing="back"
        requireFace={false}
        onCapture={(result) => { setCapturedPhoto(result); setCameraOpen(false); }}
        onClose={() => setCameraOpen(false)}
      />
    </SafeAreaView>
  );
}

// ─── Wizard footer (Back / Next buttons) ─────────────────────────────────────

function WizardFooter({
  step,
  onBack,
  onNext,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.footer}>
      <TouchableOpacity
        style={styles.footerBack}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Previous step"
      >
        <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
        <Text style={styles.footerBackText}>{step === 1 ? 'Cancel' : 'Back'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.footerNext}
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel="Next step"
      >
        <Text style={styles.footerNextText}>
          {step === TOTAL_STEPS - 1 ? 'Review →' : 'Next →'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Recap row ────────────────────────────────────────────────────────────────

function RecapRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.recapRow}>
      <Ionicons name={icon as any} size={15} color={Colors.primary} />
      <Text style={styles.recapLabel}>{label}</Text>
      <Text style={styles.recapValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  progressTrack: { height: 4, backgroundColor: Colors.gray200 },
  progressFill: { height: 4, backgroundColor: Colors.primary },
  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: Colors.primary },
  dotInactive: { backgroundColor: Colors.gray300 },

  content: { padding: Spacing.md, paddingBottom: 40 },
  card: { marginBottom: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  cardSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },

  // Customer search
  searchBox: {
    borderWidth: 1.5, borderColor: Colors.gray300, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: FontSize.md, color: Colors.textPrimary, marginBottom: Spacing.xs,
  },
  inputError: { borderColor: Colors.error },
  errText: { fontSize: FontSize.xs, color: Colors.error, marginBottom: Spacing.sm },
  dropdown: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: BorderRadius.md,
    backgroundColor: Colors.white, marginBottom: Spacing.sm, overflow: 'hidden',
  },
  dropRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.md },
  dropItem: { borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  dropItemInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  dropAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  dropAvatarText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  dropName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  dropSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 1 },
  selectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.successSurface ?? Colors.gray100,
    borderRadius: BorderRadius.sm, padding: Spacing.sm, marginTop: Spacing.xs,
  },
  selectedText: { flex: 1, fontSize: FontSize.sm, fontWeight: '600', color: Colors.success },

  // GPS
  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.info,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm, marginTop: Spacing.xs,
  },
  gpsBtnLoading: { opacity: 0.7 },
  gpsBtnText: { color: Colors.white, fontWeight: '600', fontSize: FontSize.sm },

  // Rating
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, borderWidth: 1.5,
    borderColor: Colors.gray300, backgroundColor: Colors.white,
  },
  pillActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  pillText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: Colors.white, fontWeight: '700' },
  starsRow: {
    flexDirection: 'row', gap: Spacing.sm,
    justifyContent: 'center', paddingVertical: Spacing.md,
  },
  ratingLabel: {
    textAlign: 'center', fontSize: FontSize.md,
    fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm,
  },
  commentBox: {
    borderWidth: 1.5, borderColor: Colors.gray300, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.md, color: Colors.textPrimary,
    minHeight: 90, marginBottom: Spacing.xs,
  },
  charCount: { fontSize: FontSize.xs, color: Colors.gray400, textAlign: 'right' },
  optional: { fontSize: FontSize.xs, fontWeight: '400', color: Colors.textSecondary },

  // Photo
  photoPreview: {
    alignItems: 'center', gap: Spacing.sm, padding: Spacing.md,
    backgroundColor: Colors.successSurface ?? Colors.gray100,
    borderRadius: BorderRadius.md,
  },
  photoOk: { fontSize: FontSize.md, fontWeight: '600', color: Colors.success },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.gray300, marginTop: 4,
  },
  retakeText: { fontSize: FontSize.sm, color: Colors.textSecondary },

  // Recap
  recapRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  recapLabel: { width: 72, fontSize: FontSize.sm, color: Colors.textSecondary },
  recapValue: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '500' },

  submitBtn: { marginBottom: Spacing.md },
  backTextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm },
  backTextLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },

  // Footer
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.md },
  footerBack: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: Spacing.sm },
  footerBackText: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: '500' },
  footerNext: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  footerNextText: { fontSize: FontSize.md, color: Colors.white, fontWeight: '700' },
});
