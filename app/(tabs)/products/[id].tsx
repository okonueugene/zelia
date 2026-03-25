import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getProduct, getProductStats } from '../../../src/api/products';
import { useAuthStore } from '../../../src/store/authStore';
import { getCacheConfig } from '../../../src/hooks/useCacheConfig';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';
import { Colors, FontSize, Spacing, BorderRadius, Shadow } from '../../../src/constants/colors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Taller hero gives product images more breathing room
const HERO_HEIGHT = 300;

// ── Status helpers ────────────────────────────────────────────────────────────

function statusLabel(s: string) {
  const map: Record<string, string> = {
    available: 'Available',
    not_available: 'Out of Stock',
    limited: 'Limited',
    offer: 'On Offer',
    active: 'Active',
    inactive: 'Inactive',
  };
  return map[s] ?? s;
}

function statusColors(s: string): { bg: string; text: string } {
  switch (s) {
    case 'available':
    case 'active':
      return { bg: Colors.successSurface, text: Colors.success };
    case 'not_available':
    case 'inactive':
      return { bg: Colors.errorSurface, text: Colors.error };
    case 'limited':
      return { bg: Colors.warningSurface, text: Colors.warning };
    case 'offer':
      return { bg: Colors.accentSurface ?? Colors.primarySurface, text: Colors.accentDark ?? Colors.primary };
    default:
      return { bg: Colors.gray100, text: Colors.gray600 };
  }
}

// ── Collapsible drawer ────────────────────────────────────────────────────────

function DrawerSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };
  return (
    <View style={drawer.wrap}>
      <TouchableOpacity style={drawer.header} onPress={toggle} activeOpacity={0.7}>
        <View style={drawer.left}>
          <View style={drawer.iconBg}>
            <Ionicons name={icon as any} size={15} color={Colors.primary} />
          </View>
          <Text style={drawer.title}>{title}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={Colors.gray500} />
      </TouchableOpacity>
      {open && <View style={drawer.body}>{children}</View>}
    </View>
  );
}

// ── Stock bar ─────────────────────────────────────────────────────────────────

function StockBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const color = value <= 0 ? Colors.error : value <= 10 ? Colors.warning : Colors.success;
  return (
    <View style={bar.track}>
      <View style={[bar.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ── Image URI resolver ────────────────────────────────────────────────────────

function resolveImageUri(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('https://')) return url;
  if (url.startsWith('http://')) {
    return __DEV__ ? url : 'https://' + url.slice(7);
  }
  return `https://backup.mcdave.co.ke${url.startsWith('/') ? '' : '/'}${url}`;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const productId = Number(id);
  const isAdmin = user?.is_admin;
  const [imgError, setImgError] = useState(false);

  const { data: product, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const data = await getProduct(productId);
      if (__DEV__) {
        console.log('[ProductDetail] raw data:', JSON.stringify(data, null, 2));
      }
      return data;
    },
    ...getCacheConfig('products'),
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['product-stats', productId],
    queryFn: async () => {
      const data = await getProductStats(productId);
      if (__DEV__) console.log('[ProductDetail] stats:', data);
      return data;
    },
    enabled: !!product,
    ...getCacheConfig('stats'),
  });

  const handleRefresh = async () => {
    await Promise.all([refetch(), refetchStats()]);
  };

  if (isLoading || !product) return <LoadingSpinner fullScreen message="Loading product..." />;

  const imageUri = imgError
    ? null
    : resolveImageUri(product.image_url) || resolveImageUri(product.image);

  const mcdaveStock   = product.mcdave_stock   ?? 0;
  const kisiiStock    = product.kisii_stock    ?? 0;
  const offshoreStock = product.offshore_stock ?? 0;
  const totalStock    = product.total_stock    ?? (mcdaveStock + kisiiStock + offshoreStock);
  const maxStock      = Math.max(mcdaveStock, kisiiStock, offshoreStock, 1);
  const sc = statusColors(product.status);

  const pricingRows = [
    { label: 'Factory',     value: product.factory_price,     icon: 'business-outline' as const },
    { label: 'Distributor', value: product.distributor_price, icon: 'car-outline' as const },
    { label: 'Wholesale',   value: product.wholesale_price,   icon: 'pricetag-outline' as const },
    { label: 'Towns',       value: product.offshore_price,    icon: 'boat-outline' as const },
    { label: 'Retail',      value: product.retail_price,      icon: 'storefront-outline' as const },
  ];

  const stockRows = [
    { label: 'McDave — Nairobi', value: mcdaveStock,   icon: 'home-outline' as const },
    { label: 'Mombasa',            value: kisiiStock,    icon: 'water-outline' as const },
    { label: 'Offshore',         value: offshoreStock, icon: 'airplane-outline' as const },
  ];

  const revenueDisplay = stats
    ? stats.total_revenue >= 1_000_000
      ? `KSh ${(stats.total_revenue / 1_000_000).toFixed(1)}M`
      : stats.total_revenue >= 1_000
      ? `KSh ${(stats.total_revenue / 1_000).toFixed(0)}K`
      : `KSh ${stats.total_revenue.toLocaleString()}`
    : '—';

  // Header button top position = safe area inset + small gap
  const headerTop = insets.top + 8;

  return (
    // edges={[]} — we handle safe areas manually so the hero image goes full-bleed
    <SafeAreaView style={styles.safe} edges={[]}>
      {/* ── Floating header buttons — positioned above hero ── */}
      <View style={[styles.headerOverlay, { top: headerTop }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.circleBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={Colors.white} />
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={() => router.push(`/(tabs)/products/${productId}/edit` as any)}
            accessibilityLabel="Edit product"
            accessibilityRole="button"
          >
            <Ionicons name="pencil" size={18} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        {/* ── Hero image with gradient overlay ── */}
        <View style={styles.hero}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Ionicons name="cube-outline" size={80} color={Colors.gray300} />
              <Text style={styles.placeholderText}>No image available</Text>
            </View>
          )}

          {/* Proper gradient fade — transparent at top, dark at bottom */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.72)']}
            locations={[0, 0.45, 1]}
            style={styles.heroGradient}
          />

          {/* Product info layered over gradient */}
          <View style={styles.heroInfo}>
            {product.category_name ? (
              <View style={styles.categoryChip}>
                <Text style={styles.heroCategory}>{product.category_name}</Text>
              </View>
            ) : null}

            <Text style={styles.heroName} numberOfLines={3}>
              {product.name}
            </Text>

            <View style={styles.heroMeta}>
              {product.barcode ? (
                <View style={styles.barcodeChip}>
                  <Ionicons name="barcode-outline" size={11} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.barcodeText}>{product.barcode}</Text>
                </View>
              ) : null}
              <View style={[styles.statusChip, { backgroundColor: sc.bg }]}>
                <View style={[styles.statusDot, { backgroundColor: sc.text }]} />
                <Text style={[styles.statusText, { color: sc.text }]}>
                  {statusLabel(product.status)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Quick stats row ── */}
        <View style={styles.statsRow}>
          {[
            { icon: 'layers-outline', color: Colors.primary,  value: String(totalStock),                  label: 'In Stock' },
            { icon: 'receipt-outline', color: Colors.accent,  value: String(stats?.total_orders ?? '—'),  label: 'Orders' },
            { icon: 'cash-outline',   color: Colors.success,  value: revenueDisplay,                      label: 'Revenue' },
            { icon: 'cube-outline',   color: Colors.info,     value: String(stats?.total_units_sold ?? '—'), label: 'Units Sold' },
          ].map((s) => (
            <View key={s.label} style={[styles.statCard, { borderLeftColor: s.color }]}>
              <Ionicons name={s.icon as any} size={16} color={s.color} />
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {s.value}
              </Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Pricing drawer ── */}
        <DrawerSection title="Pricing by Tier" icon="pricetags-outline" defaultOpen>
          {pricingRows.map((row, i) => (
            <View
              key={row.label}
              style={[styles.priceRow, i === pricingRows.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={styles.priceLeft}>
                <Ionicons name={row.icon} size={13} color={Colors.textSecondary} />
                <Text style={styles.priceLabel}>{row.label}</Text>
              </View>
              <Text style={styles.priceValue}>
                KSh {parseFloat(row.value || '0').toLocaleString()}
              </Text>
            </View>
          ))}
        </DrawerSection>

        {/* ── Stock drawer ── */}
        <DrawerSection title="Stock by Store" icon="storefront-outline" defaultOpen>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total across all stores</Text>
            <Text
              style={[
                styles.totalValue,
                totalStock <= 0
                  ? { color: Colors.error }
                  : totalStock <= 10
                  ? { color: Colors.warning }
                  : {},
              ]}
            >
              {totalStock} units
            </Text>
          </View>
          {stockRows.map((row, i) => (
            <View
              key={row.label}
              style={[styles.storeRow, i === stockRows.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={styles.storeLeft}>
                <Ionicons name={row.icon} size={14} color={Colors.primary} />
                <Text style={styles.storeLabel}>{row.label}</Text>
              </View>
              <View style={styles.storeRight}>
                <Text
                  style={[
                    styles.storeQty,
                    row.value <= 0
                      ? { color: Colors.error }
                      : row.value <= 10
                      ? { color: Colors.warning }
                      : { color: Colors.success },
                  ]}
                >
                  {row.value} units
                </Text>
                <StockBar value={row.value} max={maxStock} />
              </View>
            </View>
          ))}
        </DrawerSection>

        {/* ── Description drawer ── */}
        {product.description ? (
          <DrawerSection title="Description" icon="document-text-outline">
            <Text style={styles.description}>{product.description}</Text>
          </DrawerSection>
        ) : null}

        {/* Bottom safe area padding */}
        <View style={{ height: insets.bottom + Spacing.md }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  headerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.50)',
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle border so button is visible against white product backgrounds
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },

  scroll: { flex: 1 },
  content: { paddingBottom: Spacing.xxl },

  // Hero
  hero: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    backgroundColor: Colors.gray200,
    overflow: 'hidden',
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  placeholderText: {
    fontSize: FontSize.sm,
    color: Colors.gray500,
    fontWeight: '500',
  },
  // True gradient — transparent top → dark bottom
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT * 0.75,
  },
  heroInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    marginBottom: 4,
  },
  heroCategory: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroName: {
    fontSize: FontSize.xxl ?? 24,
    fontWeight: '800',
    color: Colors.white,
    lineHeight: 30,
    // Text shadow so title is legible even on light product images
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  barcodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  barcodeText: {
    fontSize: FontSize.xs,
    color: Colors.white,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.background,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 3,
    borderLeftWidth: 3,
    ...Shadow.sm,
  },
  statValue: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Pricing
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  priceLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  priceLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  priceValue: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary },

  // Stock
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  totalLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  totalValue: { fontSize: FontSize.md, fontWeight: '700', color: Colors.success },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  storeLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1 },
  storeLabel: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '500' },
  storeRight: { alignItems: 'flex-end', gap: 5 },
  storeQty: { fontSize: FontSize.sm, fontWeight: '700' },

  // Description
  description: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 21 },
});

// ── Drawer styles ─────────────────────────────────────────────────────────────

const drawer = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconBg: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  body: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
});

// ── Stock bar styles ──────────────────────────────────────────────────────────

const bar = StyleSheet.create({
  track: {
    height: 5,
    width: 80,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: BorderRadius.full },
});
