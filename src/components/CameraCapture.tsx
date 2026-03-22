/**
 * CameraCapture — camera modal with face-guide oval overlay.
 *
 * Face detection behaviour:
 * - When expo-face-detector is available (custom build / production APK):
 *     capture button is DISABLED until a face is centred inside the oval.
 * - When unavailable (Expo Go): oval is a visual guide only, capture is always enabled.
 *
 * UX improvements over previous version:
 * - Capture button properly locked behind face-in-position gate
 * - Animated oval pulse when face is in position (green glow)
 * - "Face required" tooltip shown when user taps a locked button
 * - GPS acquiring indicator with retry button on failure
 * - Watermark shows timestamp + GPS + username on preview
 * - Accessible: all interactive elements have accessible labels
 * - Header safe-area aware via paddingTop from StatusBar height
 * - base64 encoding included in capture result for upload
 */
import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Animated,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { FaceFeature } from 'expo-face-detector';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors, FontSize, Spacing, BorderRadius } from '../constants/colors';

// Dynamically require expo-face-detector — only available in native builds, not Expo Go
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let FD: any = null;
try {
  FD = require('expo-face-detector');
} catch {
  // Expo Go: face detection unavailable, oval is visual guide only
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CaptureResult {
  uri: string;
  base64?: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
}

interface CameraCaptureProps {
  visible: boolean;
  username: string;
  onCapture: (result: CaptureResult) => void;
  onClose: () => void;
  title?: string;
  /** 'back' (default) for standard photo; 'front' for selfie/face verification */
  facing?: 'front' | 'back';
  /** When true, capture is blocked until a face is detected in the oval (default: true in native builds) */
  requireFace?: boolean;
}

// ─── Oval geometry constants ──────────────────────────────────────────────────

const OVAL_W_RATIO = 0.62;
const OVAL_H_RATIO = 0.52;
const OVAL_CENTER_Y_RATIO = 0.46;

// Safe area top — approximate fallback if we can't read it
const STATUS_BAR_HEIGHT =
  Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : 44;

// ─── Component ────────────────────────────────────────────────────────────────

export function CameraCapture({
  visible,
  username,
  onCapture,
  onClose,
  title = 'Take Photo',
  facing = 'back',
  requireFace = true,
}: CameraCaptureProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [locationPermission, requestLocationPermission] =
    Location.useForegroundPermissions();

  const [preview, setPreview] = useState<string | null>(null);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsFailed, setGpsFailed] = useState(false);

  // Face detection state
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceInPosition, setFaceInPosition] = useState(false);
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });

  // Pulse animation when face locks in
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    if (faceInPosition) {
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => pulseRef.current?.stop();
  }, [faceInPosition]);

  // Reset + acquire GPS when modal opens
  React.useEffect(() => {
    if (!visible) {
      setPreview(null);
      setCaptureResult(null);
      setFaceDetected(false);
      setFaceInPosition(false);
      setGpsFailed(false);
      return;
    }
    acquireGps();
  }, [visible]);

  const acquireGps = useCallback(async () => {
    setGpsLoading(true);
    setGpsFailed(false);
    try {
      if (!locationPermission?.granted) {
        await requestLocationPermission();
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
      });
      setGpsCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      setGpsCoords(null);
      setGpsFailed(true);
    } finally {
      setGpsLoading(false);
    }
  }, [locationPermission, requestLocationPermission]);

  // Oval bounding box in view-space pixels
  const ovalBounds = useMemo(() => {
    const { width, height } = cameraLayout;
    if (!width || !height) return null;
    const ovalW = width * OVAL_W_RATIO;
    const ovalH = height * OVAL_H_RATIO;
    const centerX = width / 2;
    const centerY = height * OVAL_CENTER_Y_RATIO;
    return {
      left: centerX - ovalW / 2,
      top: centerY - ovalH / 2,
      right: centerX + ovalW / 2,
      bottom: centerY + ovalH / 2,
      width: ovalW,
      height: ovalH,
      centerX,
      centerY,
    };
  }, [cameraLayout]);

  const handleCameraLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCameraLayout({ width, height });
  }, []);

  // Face detection callback from CameraView
  const handleFacesDetected = useCallback(
    ({ faces }: { faces: FaceFeature[] }) => {
      if (!faces || faces.length === 0) {
        setFaceDetected(false);
        setFaceInPosition(false);
        return;
      }
      setFaceDetected(true);
      if (!ovalBounds) return;

      // Use the largest (closest) face
      const face = faces.reduce((best, f) =>
        f.bounds.size.width > best.bounds.size.width ? f : best
      );
      const { origin, size } = face.bounds;
      const faceCX = origin.x + size.width / 2;
      const faceCY = origin.y + size.height / 2;

      // 12% tolerance margin — face centre must be within inner region of oval
      const tolerX = ovalBounds.width * 0.12;
      const tolerY = ovalBounds.height * 0.12;
      const centred =
        faceCX >= ovalBounds.left + tolerX &&
        faceCX <= ovalBounds.right - tolerX &&
        faceCY >= ovalBounds.top + tolerY &&
        faceCY <= ovalBounds.bottom - tolerY;

      // Face must not be too small (far away) or too large (too close)
      const minW = ovalBounds.width * 0.28;
      const maxW = ovalBounds.width * 1.15;
      const sizeOk = size.width >= minW && size.width <= maxW;

      setFaceInPosition(centred && sizeOk);
    },
    [ovalBounds]
  );

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,          // include base64 for upload
        skipProcessing: false,
      });
      if (!photo) throw new Error('No photo captured');

      const timestamp = format(new Date(), 'dd/MM/yyyy, HH:mm:ss');
      const result: CaptureResult = {
        uri: photo.uri,
        base64: photo.base64,
        latitude: gpsCoords?.lat ?? null,
        longitude: gpsCoords?.lng ?? null,
        timestamp,
      };
      setPreview(photo.uri);
      setCaptureResult(result);
    } catch {
      Alert.alert('Camera Error', 'Failed to capture photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, gpsCoords]);

  // Tap on disabled button — explain why
  const handleLockedTap = () => {
    Alert.alert(
      'Face Required',
      'Position your face inside the oval to unlock the capture button.',
      [{ text: 'OK' }]
    );
  };

  const handleUse = () => {
    if (captureResult) {
      onCapture(captureResult);
      setPreview(null);
      setCaptureResult(null);
    }
  };

  const handleRetake = () => {
    setPreview(null);
    setCaptureResult(null);
    setFaceDetected(false);
    setFaceInPosition(false);
  };

  if (!permission) return null;

  // Face gating: only block when native face detector is available AND requireFace is true
  const faceDetectionAvailable = FD !== null;
  const faceGateActive = faceDetectionAvailable && requireFace;

  // Capture is disabled while processing OR when face gate is active and face not in position
  const captureReady = faceGateActive ? faceInPosition : true;
  const captureDisabled = capturing || !captureReady;

  // Oval border colour
  const ovalColor = faceInPosition
    ? '#4ADE80'
    : faceDetected
    ? '#FBBF24'
    : 'rgba(255,255,255,0.7)';

  // Instruction text
  const guideText = !faceDetectionAvailable
    ? 'Position your face in the oval'
    : faceInPosition
    ? '✓ Hold still — ready to capture!'
    : faceDetected
    ? 'Move closer or centre your face'
    : 'Position your face inside the oval';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: STATUS_BAR_HEIGHT + 8 }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close camera"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={26} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* ── No camera permission ── */}
        {!permission.granted ? (
          <View style={styles.center}>
            <Ionicons name="camera-outline" size={64} color={Colors.gray400} />
            <Text style={styles.permText}>Camera access is required to take photos</Text>
            <TouchableOpacity
              style={styles.permBtn}
              onPress={requestPermission}
              accessibilityRole="button"
            >
              <Text style={styles.permBtnText}>Grant Camera Permission</Text>
            </TouchableOpacity>
          </View>

        ) : preview ? (
          /* ── Preview mode ── */
          <View style={styles.previewContainer}>
            <Image source={{ uri: preview }} style={styles.preview} resizeMode="cover" />

            {/* Watermark overlay */}
            <View style={styles.watermark}>
              <Text style={styles.watermarkText}>👤 {username}</Text>
              {gpsCoords && (
                <Text style={styles.watermarkText}>
                  📍 {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}
                </Text>
              )}
              <Text style={styles.watermarkText}>🕐 {captureResult?.timestamp}</Text>
            </View>

            {/* Preview actions */}
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={handleRetake}
                accessibilityLabel="Retake photo"
                accessibilityRole="button"
              >
                <Ionicons name="refresh-outline" size={20} color={Colors.white} />
                <Text style={styles.btnText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.useBtn}
                onPress={handleUse}
                accessibilityLabel="Use this photo"
                accessibilityRole="button"
              >
                <Ionicons name="checkmark-outline" size={20} color={Colors.white} />
                <Text style={styles.btnText}>Use Photo</Text>
              </TouchableOpacity>
            </View>
          </View>

        ) : (
          /* ── Live camera ── */
          <View style={styles.cameraContainer} onLayout={handleCameraLayout}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing={facing}
              zoom={0}
              {...(FD ? {
                onFacesDetected: handleFacesDetected,
                faceDetectorSettings: {
                  mode: FD.FaceDetectorMode.fast,
                  detectLandmarks: FD.FaceDetectorLandmarks.none,
                  runClassifications: FD.FaceDetectorClassifications.none,
                  minDetectionInterval: 150,   // slightly faster than before
                  tracking: true,
                },
              } as any : {})}
            />

            {/* ── Oval guide overlay ── */}
            {ovalBounds && (
              <>
                {/* Dark vignette — four rectangles around the oval */}
                <View style={[styles.vignette, { top: 0, left: 0, right: 0, height: ovalBounds.top }]} />
                <View style={[styles.vignette, { top: ovalBounds.bottom, left: 0, right: 0, bottom: 0 }]} />
                <View style={[styles.vignette, { top: ovalBounds.top, left: 0, width: ovalBounds.left, height: ovalBounds.height }]} />
                <View style={[styles.vignette, { top: ovalBounds.top, right: 0, width: cameraLayout.width - ovalBounds.right, height: ovalBounds.height }]} />

                {/* Animated oval border */}
                <Animated.View
                  style={[
                    styles.ovalGuide,
                    {
                      left: ovalBounds.left,
                      top: ovalBounds.top,
                      width: ovalBounds.width,
                      height: ovalBounds.height,
                      borderRadius: ovalBounds.width / 2,
                      borderColor: ovalColor,
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                />

                {/* Corner accent marks at top of oval for alignment aid */}
                <View style={[styles.cornerMark, styles.cornerTL, { left: ovalBounds.left - 2, top: ovalBounds.top - 2, borderColor: ovalColor }]} />
                <View style={[styles.cornerMark, styles.cornerTR, { right: cameraLayout.width - ovalBounds.right - 2, top: ovalBounds.top - 2, borderColor: ovalColor }]} />

                {/* Instruction label below the oval */}
                <View style={[styles.guideLabelWrap, { top: ovalBounds.bottom + 14, left: 0, right: 0 }]}>
                  {faceInPosition && (
                    <Ionicons name="checkmark-circle" size={18} color="#4ADE80" style={{ marginRight: 6 }} />
                  )}
                  <Text style={[styles.guideLabel, { color: ovalColor }]}>{guideText}</Text>
                </View>

                {/* Face gate status badge — only show when face detection is active */}
                {faceGateActive && (
                  <View style={[
                    styles.gateBadge,
                    { top: ovalBounds.top - 44, alignSelf: 'center', left: ovalBounds.left },
                    faceInPosition ? styles.gateBadgeReady : styles.gateBadgeWaiting,
                  ]}>
                    <Ionicons
                      name={faceInPosition ? 'shield-checkmark' : 'scan-outline'}
                      size={13}
                      color={Colors.white}
                    />
                    <Text style={styles.gateBadgeText}>
                      {faceInPosition ? 'Face verified' : 'Waiting for face…'}
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* GPS status */}
            <View style={styles.gpsOverlay}>
              <View style={[
                styles.gpsDot,
                gpsCoords ? styles.gpsOk : gpsLoading ? styles.gpsWaiting : styles.gpsFail,
              ]} />
              <Text style={styles.gpsText}>
                {gpsLoading
                  ? 'Acquiring GPS…'
                  : gpsCoords
                  ? `GPS ✓ ${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}`
                  : 'GPS unavailable'}
              </Text>
              {gpsFailed && !gpsLoading && (
                <TouchableOpacity onPress={acquireGps} style={styles.gpsRetryBtn}>
                  <Ionicons name="refresh" size={12} color={Colors.white} />
                </TouchableOpacity>
              )}
            </View>

            {/* Username overlay */}
            <View style={styles.userOverlay}>
              <Ionicons name="person-circle-outline" size={16} color={Colors.white} />
              <Text style={styles.userOverlayText}>{username}</Text>
            </View>

            {/* Capture button row */}
            <View style={styles.captureRow}>
              {/* Invisible touchable behind disabled button to explain the lock */}
              {captureDisabled && !capturing ? (
                <TouchableOpacity
                  style={[styles.captureBtn, styles.captureBtnDisabled]}
                  onPress={handleLockedTap}
                  accessibilityLabel="Capture locked — align face in oval first"
                  accessibilityRole="button"
                >
                  <Ionicons name="lock-closed" size={28} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.captureBtn,
                    faceInPosition && styles.captureBtnReady,
                  ]}
                  onPress={handleCapture}
                  disabled={captureDisabled}
                  accessibilityLabel="Capture photo"
                  accessibilityRole="button"
                  activeOpacity={0.8}
                >
                  {capturing ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <View style={[styles.captureInner, faceInPosition && styles.captureInnerReady]} />
                  )}
                </TouchableOpacity>
              )}

              <Text style={styles.captureHint}>
                {capturing
                  ? 'Capturing…'
                  : captureReady
                  ? 'Tap to capture'
                  : faceGateActive
                  ? 'Align face to unlock'
                  : 'Ready'}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  permText: {
    fontSize: FontSize.md,
    color: Colors.gray400,
    textAlign: 'center',
    lineHeight: 22,
  },
  permBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  permBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  vignette: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  ovalGuide: {
    position: 'absolute',
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  // Small corner accent marks at top of oval
  cornerMark: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  cornerTL: {
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 4,
  },
  guideLabelWrap: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  guideLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  // Face gate status badge above oval
  gateBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  gateBadgeWaiting: {
    backgroundColor: 'rgba(251,191,36,0.85)',
  },
  gateBadgeReady: {
    backgroundColor: 'rgba(74,222,128,0.9)',
  },
  gateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
  },
  gpsOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    position: 'absolute',
    bottom: 100,
    left: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gpsOk: { backgroundColor: '#4ADE80' },
  gpsWaiting: { backgroundColor: '#FBBF24' },
  gpsFail: { backgroundColor: '#F87171' },
  gpsText: {
    fontSize: 11,
    color: Colors.white,
    fontWeight: '500',
  },
  gpsRetryBtn: {
    marginLeft: 4,
    padding: 2,
  },
  userOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    position: 'absolute',
    bottom: 100,
    right: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  userOverlayText: {
    fontSize: 11,
    color: Colors.white,
    fontWeight: '600',
  },
  captureRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 44,
    paddingTop: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.45)',
    gap: Spacing.sm,
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnDisabled: {
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  captureBtnReady: {
    borderColor: '#4ADE80',
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  captureInnerReady: {
    backgroundColor: Colors.white,
  },
  captureHint: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  // Preview
  previewContainer: {
    flex: 1,
    position: 'relative',
  },
  preview: {
    flex: 1,
  },
  watermark: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 3,
  },
  watermarkText: {
    fontSize: 12,
    color: Colors.white,
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  previewActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.xl,
    paddingBottom: 44,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  retakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  useBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.secondary ?? Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  btnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.white,
  },
});
