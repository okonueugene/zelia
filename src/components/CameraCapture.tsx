/**
 * CameraCapture — camera modal with GPS watermark and motion-aware scanner overlay.
 *
 * Scanner stages (no face detection required):
 *   initializing → aligning → steady → capturing
 *
 * Motion detection via expo-sensors Accelerometer:
 *   - Shaking/moving  → red dashed oval + "Hold steady"
 *   - Still           → green solid oval + "Tap to capture"
 */
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
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
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors, FontSize, Spacing, BorderRadius } from '../constants/colors';

// Dynamically require expo-sensors — may not be installed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Accelerometer: any = null;
try {
  Accelerometer = require('expo-sensors').Accelerometer;
} catch {
  // expo-sensors not installed — motion detection disabled, always shows steady state
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
  facing?: 'front' | 'back';
}

// ─── Scanner stage definition ─────────────────────────────────────────────────

type ScanStage = 'initializing' | 'aligning' | 'steady';

const STAGE_CONFIG: Record<ScanStage, {
  borderColor: string;
  borderStyle: 'solid' | 'dashed';
  dimOpacity: number;
  icon: string;
  label: string;
  labelColor: string;
}> = {
  initializing: {
    borderColor: 'rgba(255,255,255,0.5)',
    borderStyle: 'solid',
    dimOpacity: 0.65,
    icon: 'scan-outline',
    label: 'Warming up camera…',
    labelColor: 'rgba(255,255,255,0.8)',
  },
  aligning: {
    borderColor: '#FBBF24',
    borderStyle: 'dashed',
    dimOpacity: 0.60,
    icon: 'move-outline',
    label: 'Hold steady — align within the guide',
    labelColor: '#FBBF24',
  },
  steady: {
    borderColor: '#4ADE80',
    borderStyle: 'solid',
    dimOpacity: 0.45,
    icon: 'checkmark-circle-outline',
    label: 'Steady — tap to capture',
    labelColor: '#4ADE80',
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const OVAL_W = SCREEN_W * 0.65;
const OVAL_H = SCREEN_H * 0.40;

// Motion threshold — acceleration magnitude delta above this = shaking
const MOTION_THRESHOLD = 0.04;
// How long device must be still before going steady (ms)
const STEADY_DELAY = 800;

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
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });

  // Scanner stage state
  const [stage, setStage] = useState<ScanStage>('initializing');
  const lastAccel = useRef({ x: 0, y: 0, z: 0 });
  const steadyTimer = useRef<NodeJS.Timeout | null>(null);

  // Pulse animation for the oval border
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Start pulse when initializing, stop otherwise
  useEffect(() => {
    if (stage === 'initializing') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.03, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => pulseLoop.current?.stop();
  }, [stage]);

  // ── Motion detection ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!visible || preview || !Accelerometer) return;

    // Start in initializing, move to aligning after 1s
    const initTimer = setTimeout(() => setStage('aligning'), 1000);

    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(({ x, y, z }: { x: number; y: number; z: number }) => {
      const dx = Math.abs(x - lastAccel.current.x);
      const dy = Math.abs(y - lastAccel.current.y);
      const dz = Math.abs(z - lastAccel.current.z);
      lastAccel.current = { x, y, z };

      const moving = dx + dy + dz > MOTION_THRESHOLD;

      if (moving) {
        // Device is moving — go to aligning, cancel any pending steady timer
        setStage((s) => s === 'initializing' ? s : 'aligning');
        if (steadyTimer.current) {
          clearTimeout(steadyTimer.current);
          steadyTimer.current = null;
        }
      } else {
        // Device is still — schedule transition to steady after delay
        if (!steadyTimer.current) {
          steadyTimer.current = setTimeout(() => {
            setStage((s) => s !== 'initializing' ? 'steady' : s);
            steadyTimer.current = null;
          }, STEADY_DELAY);
        }
      }
    });

    return () => {
      clearTimeout(initTimer);
      if (steadyTimer.current) clearTimeout(steadyTimer.current);
      sub.remove();
    };
  }, [visible, preview]);

  // If expo-sensors not available, go straight to steady after init
  useEffect(() => {
    if (!visible || preview || Accelerometer) return;
    const t = setTimeout(() => setStage('steady'), 1200);
    return () => clearTimeout(t);
  }, [visible, preview]);

  // ── GPS acquisition ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!visible) {
      setPreview(null);
      setCaptureResult(null);
      setGpsFailed(false);
      setStage('initializing');
      return;
    }
    acquireGps();
  }, [visible]);

  const acquireGps = useCallback(async () => {
    setGpsLoading(true);
    setGpsFailed(false);
    try {
      if (!locationPermission?.granted) await requestLocationPermission();
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setGpsCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      setGpsCoords(null);
      setGpsFailed(true);
    } finally {
      setGpsLoading(false);
    }
  }, [locationPermission, requestLocationPermission]);

  // ── Camera layout ───────────────────────────────────────────────────────────

  const handleCameraLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCameraLayout({ width, height });
  }, []);

  // Vignette rects computed from layout
  const ovalBounds = useMemo(() => {
    const { width, height } = cameraLayout;
    if (!width || !height) return null;
    const ow = width * 0.65;
    const oh = height * 0.40;
    const cx = width / 2;
    const cy = height * 0.44;
    return {
      left: cx - ow / 2,
      top: cy - oh / 2,
      right: cx + ow / 2,
      bottom: cy + oh / 2,
      width: ow,
      height: oh,
    };
  }, [cameraLayout]);

  // ── Capture ─────────────────────────────────────────────────────────────────

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,
        skipProcessing: false,
      });
      if (!photo) throw new Error('No photo captured');
      const result: CaptureResult = {
        uri: photo.uri,
        base64: photo.base64,
        latitude: gpsCoords?.lat ?? null,
        longitude: gpsCoords?.lng ?? null,
        timestamp: format(new Date(), 'dd/MM/yyyy, HH:mm:ss'),
      };
      setPreview(photo.uri);
      setCaptureResult(result);
    } catch {
      Alert.alert('Camera Error', 'Failed to capture photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, gpsCoords]);

  const handleUse = useCallback(() => {
    if (captureResult) {
      onCapture(captureResult);
      setPreview(null);
      setCaptureResult(null);
    }
  }, [captureResult, onCapture]);

  const handleRetake = useCallback(() => {
    setPreview(null);
    setCaptureResult(null);
    setStage('initializing');
  }, []);

  if (!permission) return null;

  const cfg = STAGE_CONFIG[stage];
  const isReady = stage === 'steady';

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
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close camera">
            <Ionicons name="close" size={26} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* ── No permission ── */}
        {!permission.granted ? (
          <View style={styles.center}>
            <Ionicons name="camera-outline" size={64} color={Colors.gray400} />
            <Text style={styles.permText}>Camera access is required to take photos</Text>
            <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>Grant Camera Permission</Text>
            </TouchableOpacity>
          </View>

        ) : preview ? (
          /* ── Preview ── */
          <View style={styles.previewContainer}>
            <Image source={{ uri: preview }} style={styles.preview} resizeMode="cover" />
            <View style={styles.watermark}>
              <Text style={styles.watermarkText}>👤 {username}</Text>
              {gpsCoords && (
                <Text style={styles.watermarkText}>
                  📍 {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}
                </Text>
              )}
              <Text style={styles.watermarkText}>🕐 {captureResult?.timestamp}</Text>
            </View>
            <View style={styles.previewActions}>
              <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake} accessibilityLabel="Retake photo">
                <Ionicons name="refresh-outline" size={20} color={Colors.white} />
                <Text style={styles.btnText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.useBtn} onPress={handleUse} accessibilityLabel="Use this photo">
                <Ionicons name="checkmark-outline" size={20} color={Colors.white} />
                <Text style={styles.btnText}>Use Photo</Text>
              </TouchableOpacity>
            </View>
          </View>

        ) : (
          /* ── Live camera ── */
          <View style={styles.cameraContainer} onLayout={handleCameraLayout}>
            <CameraView ref={cameraRef} style={styles.camera} facing={facing} zoom={0} />

            {/* ── Scanner overlay (pointerEvents="none" so touches pass through) ── */}
            {ovalBounds && (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">

                {/* Dimmed vignette — four rectangles around the oval */}
                <Animated.View style={[styles.vignette, { top: 0, left: 0, right: 0, height: ovalBounds.top, opacity: cfg.dimOpacity }]} />
                <Animated.View style={[styles.vignette, { top: ovalBounds.bottom, left: 0, right: 0, bottom: 0, opacity: cfg.dimOpacity }]} />
                <Animated.View style={[styles.vignette, { top: ovalBounds.top, left: 0, width: ovalBounds.left, height: ovalBounds.height, opacity: cfg.dimOpacity }]} />
                <Animated.View style={[styles.vignette, { top: ovalBounds.top, right: 0, width: cameraLayout.width - ovalBounds.right, height: ovalBounds.height, opacity: cfg.dimOpacity }]} />

                {/* Oval border — animated scale on initializing */}
                <Animated.View
                  style={[
                    styles.ovalGuide,
                    {
                      left: ovalBounds.left,
                      top: ovalBounds.top,
                      width: ovalBounds.width,
                      height: ovalBounds.height,
                      borderRadius: ovalBounds.width / 2,
                      borderColor: cfg.borderColor,
                      borderStyle: cfg.borderStyle,
                      borderWidth: stage === 'steady' ? 3 : 2,
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                />

                {/* Corner brackets — tech scanner feel */}
                {(['TL', 'TR', 'BL', 'BR'] as const).map((corner) => (
                  <View
                    key={corner}
                    style={[
                      styles.corner,
                      corner === 'TL' && { top: ovalBounds.top - 1, left: ovalBounds.left - 1, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
                      corner === 'TR' && { top: ovalBounds.top - 1, right: cameraLayout.width - ovalBounds.right - 1, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
                      corner === 'BL' && { bottom: cameraLayout.height - ovalBounds.bottom - 1, left: ovalBounds.left - 1, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
                      corner === 'BR' && { bottom: cameraLayout.height - ovalBounds.bottom - 1, right: cameraLayout.width - ovalBounds.right - 1, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
                      { borderColor: cfg.borderColor },
                    ]}
                  />
                ))}

                {/* Stage instruction badge — below oval */}
                <View style={[styles.instructionBox, { top: ovalBounds.bottom + 16 }]}>
                  <Ionicons name={cfg.icon as any} size={16} color={cfg.labelColor} />
                  <Text style={[styles.instructionText, { color: cfg.labelColor }]}>
                    {cfg.label}
                  </Text>
                </View>

                {/* Stage indicator dots — above oval */}
                <View style={[styles.stageDots, { top: ovalBounds.top - 36 }]}>
                  {(['initializing', 'aligning', 'steady'] as ScanStage[]).map((s) => (
                    <View
                      key={s}
                      style={[
                        styles.stageDot,
                        stage === s && styles.stageDotActive,
                        s === 'steady' && stage === 'steady' && { backgroundColor: '#4ADE80' },
                        s === 'aligning' && stage === 'aligning' && { backgroundColor: '#FBBF24' },
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* GPS status */}
            <View style={styles.gpsOverlay}>
              <View style={[styles.gpsDot, gpsCoords ? styles.gpsOk : gpsLoading ? styles.gpsWaiting : styles.gpsFail]} />
              <Text style={styles.gpsText}>
                {gpsLoading ? 'Acquiring GPS…' : gpsCoords
                  ? `GPS ✓ ${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}`
                  : 'GPS unavailable'}
              </Text>
              {gpsFailed && !gpsLoading && (
                <TouchableOpacity onPress={acquireGps} style={styles.gpsRetryBtn} accessibilityLabel="Retry GPS">
                  <Ionicons name="refresh" size={12} color={Colors.white} />
                </TouchableOpacity>
              )}
            </View>

            {/* Username overlay */}
            <View style={styles.userOverlay}>
              <Ionicons name="person-circle-outline" size={16} color={Colors.white} />
              <Text style={styles.userOverlayText}>{username}</Text>
            </View>

            {/* Capture button */}
            <View style={styles.captureRow}>
              <TouchableOpacity
                style={[
                  styles.captureBtn,
                  capturing && styles.captureBtnDisabled,
                  isReady && styles.captureBtnReady,
                ]}
                onPress={handleCapture}
                disabled={capturing}
                accessibilityLabel="Capture photo"
                activeOpacity={0.8}
              >
                {capturing ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <View style={[styles.captureInner, isReady && styles.captureInnerReady]} />
                )}
              </TouchableOpacity>
              <Text style={[styles.captureHint, isReady && { color: '#4ADE80' }]}>
                {capturing ? 'Capturing…' : cfg.label}
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
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  permText: { fontSize: FontSize.md, color: Colors.gray400, textAlign: 'center', lineHeight: 22 },
  permBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },
  permBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },

  cameraContainer: { flex: 1, position: 'relative' },
  camera: { flex: 1 },

  // Vignette — solid dark background, opacity set dynamically per stage
  vignette: { position: 'absolute', backgroundColor: '#000' },

  ovalGuide: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },

  // Corner bracket marks
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderWidth: 3,
    backgroundColor: 'transparent',
  },

  // Stage instruction badge
  instructionBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.lg,
  },
  instructionText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Stage progress dots
  stageDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  stageDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  stageDotActive: {
    width: 9,
    height: 9,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },

  // GPS
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
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsOk: { backgroundColor: '#4ADE80' },
  gpsWaiting: { backgroundColor: '#FBBF24' },
  gpsFail: { backgroundColor: '#F87171' },
  gpsText: { fontSize: 11, color: Colors.white, fontWeight: '500' },
  gpsRetryBtn: { marginLeft: 4, padding: 2 },

  // Username
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
  userOverlayText: { fontSize: 11, color: Colors.white, fontWeight: '600' },

  // Capture button
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
  captureBtnDisabled: { opacity: 0.4 },
  captureBtnReady: {
    borderColor: '#4ADE80',
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 8,
  },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.6)' },
  captureInnerReady: { backgroundColor: Colors.white },
  captureHint: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },

  // Preview
  previewContainer: { flex: 1, position: 'relative' },
  preview: { flex: 1 },
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
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
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
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  btnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.white },
});
