/**
 * Order Edit Screen — app/(tabs)/orders/[id]/edit.tsx
 * Covers everything not in the detail screen:
 *   - Edit order items (qty, unit price, remove)
 *   - Add product to order
 *   - Edit header fields: phone, address, delivery fee, VAT, store, notes
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {
  getOrder,
  getOrderItems,
  updateOrder,
  updateOrderItem,
  addItemToOrder,
  removeItemFromOrder,
  recalculateOrder,
} from '../../../../src/api/orders';
import { getProducts } from '../../../../src/api/products';
import { getCacheConfig } from '../../../../src/hooks/useCacheConfig';
import { LoadingSpinner } from '../../../../src/components/ui/LoadingSpinner';
import { Colors, FontSize, Spacing, BorderRadius, Shadow } from '../../../../src/constants/colors';
import type { OrderItem } from '../../../../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={icon as any} size={15} color={Colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={Colors.gray400}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        autoCapitalize="none"
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OrderEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const orderId = Number(id);

  // ── Data ────────────────────────────────────────────────────────────────────

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getOrder(orderId),
    ...getCacheConfig('orders'),
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['order-items', orderId],
    queryFn: () => getOrderItems(orderId),
    ...getCacheConfig('orders'),
  });

  // Products for add-item picker
  const { data: productsData } = useQuery({
    queryKey: ['products', 1],
    queryFn: () => getProducts({ page: 1 }),
    ...getCacheConfig('products'),
  });
  const products = productsData?.results ?? [];

  // ── Header form state (initialised from order once loaded) ──────────────────

  const [phone, setPhone]           = useState('');
  const [address, setAddress]       = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [vatVariation, setVatVariation] = useState<'with_vat' | 'without_vat'>('without_vat');
  const [store, setStore]           = useState('');
  const [notes, setNotes]           = useState('');
  const [headerInitialised, setHeaderInitialised] = useState(false);

  // Initialise form from order data (once)
React.useEffect(() => {
  if (order && !headerInitialised) {
    setPhone(order.phone ?? '');
    setAddress(order.address ?? '');
    setDeliveryFee(String(order.delivery_fee ?? '0'));
    setVatVariation((order.vat_variation as any) ?? 'without_vat');
    setStore(order.store ?? '');
    setNotes((order as any).notes ?? '');
    setHeaderInitialised(true);
  }
}, [order, headerInitialised]);

  // ── Item edit state ─────────────────────────────────────────────────────────

  // Per-item editable qty/price (keyed by item.id)
  const [itemEdits, setItemEdits] = useState<Record<number, { qty: string; price: string }>>({});
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  // Add-item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [addProductId, setAddProductId] = useState<number | null>(null);
  const [addQty, setAddQty]     = useState('1');
  const [addPrice, setAddPrice] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 20);
    const term = productSearch.toLowerCase();
    return products.filter((p: any) =>
      p.name.toLowerCase().includes(term)
    ).slice(0, 20);
  }, [products, productSearch]);

  // ── Mutations ───────────────────────────────────────────────────────────────

    // ── Mutations ───────────────────────────────────────────────────────────────

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    queryClient.invalidateQueries({ queryKey: ['order-items', orderId] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  }, [queryClient, orderId]);

  const [recalculatingTotals, setRecalculatingTotals] = useState(false);

  // 1. Save Header (only changed fields) + force recalculation
  const { mutate: saveHeader, isPending: savingHeader } = useMutation({
    mutationFn: () => {
      const payload: any = {};

      if (phone !== (order?.phone ?? '')) payload.phone = phone || undefined;
      if (address !== (order?.address ?? '')) payload.address = address || undefined;
      if (deliveryFee !== String(order?.delivery_fee ?? '0')) 
        payload.delivery_fee = deliveryFee || undefined;
      if (vatVariation !== (order?.vat_variation ?? 'without_vat')) 
        payload.vat_variation = vatVariation;
      if (store !== (order?.store ?? '')) payload.store = store || undefined;
      if (notes !== ((order as any)?.notes ?? '')) payload.notes = notes || undefined;

      return updateOrder(orderId, payload);
    },
    onSuccess: () => {
      // Strong invalidation - clear cache completely
  queryClient.invalidateQueries({ queryKey: ['order', orderId], refetchType: 'all' });
  queryClient.invalidateQueries({ queryKey: ['order-items', orderId], refetchType: 'all' });
  queryClient.invalidateQueries({ queryKey: ['orders'], refetchType: 'all' });

  Toast.show({ type: 'success', text1: 'Order saved successfully!' });

  // Small delay so the previous screen has time to refetch
  setTimeout(() => {
    router.back();
  }, 300);
    },
    onError: (e: any) => Toast.show({ 
      type: 'error', 
      text1: 'Header save failed', 
      text2: e.response?.data?.address?.[0] || e.message 
    }),
  });

  // 2. Update single item (qty / price) + force totals recalc
  const { mutate: saveItem, isPending: savingItem } = useMutation({
    mutationFn: async ({ itemId, qty, price }: { itemId: number; qty: string; price: string }) => {
      await updateOrderItem(itemId, { quantity: Number(qty), unit_price: price });
      return recalculateOrder(orderId);
    },
    onSuccess: () => {
      invalidate();
      setExpandedItem(null);
      setItemEdits({});
      Toast.show({ type: 'success', text1: 'Item updated' });
    },
    onError: (e: Error) => Toast.show({ type: 'error', text1: 'Update failed', text2: e.message }),
  });

  // 3. Delete item
  const { mutate: removeItem, isPending: removingItem } = useMutation({
    mutationFn: (itemId: number) => removeItemFromOrder(orderId, itemId),
    onSuccess: () => {
      invalidate();
      Toast.show({ type: 'success', text1: 'Item removed' });
    },
    onError: (e: Error) => Toast.show({ type: 'error', text1: 'Remove failed', text2: e.message }),
  });

  // 4. Add new item
  const { mutate: doAddItem, isPending: addingItem } = useMutation({
    mutationFn: () => {
      if (!addProductId) throw new Error('Select a product');
      return addItemToOrder(orderId, {
        product_id: addProductId,
        quantity: Number(addQty),
        unit_price: addPrice || undefined,
      });
    },
    onSuccess: () => {
      invalidate();
      setShowAddItem(false);
      setAddProductId(null);
      setAddQty('1');
      setAddPrice('');
      setProductSearch('');
      Toast.show({ type: 'success', text1: 'Item added' });
    },
    onError: (e: Error) => Toast.show({ type: 'error', text1: 'Add failed', text2: e.message }),
  });
  // ── Item helpers ─────────────────────────────────────────────────────────────

  const getItemEdit = (item: OrderItem) =>
    itemEdits[item.id] ?? { qty: String(item.quantity), price: item.unit_price };

  const setItemField = (itemId: number, field: 'qty' | 'price', value: string) => {
    setItemEdits((prev) => ({
      ...prev,
      [itemId]: { ...getItemEdit({ id: itemId } as any), ...prev[itemId], [field]: value },
    }));
  };

  const handleDeleteItem = (item: OrderItem) => {
    Alert.alert(
      'Remove Item',
      `Remove "${item.product_name}" from this order?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeItem(item.id) },
      ],
    );
  };

  // ── Guard ────────────────────────────────────────────────────────────────────

  if (orderLoading || itemsLoading) {
    return <LoadingSpinner fullScreen message="Loading order…" />;
  }
  if (!order) return null;

  const lineTotal = (item: OrderItem) => {
    const qtyNum = Number(getItemEdit(item).qty) || 0;
    const unitNum = parseFloat(getItemEdit(item).price || '0') || 0;
    const varianceNum = parseFloat(item.variance ?? '0') || 0;
    // Keep preview consistent with create screen: unit_price + variance per unit.
    return qtyNum * (unitNum + varianceNum);
  };

  const subtotalPreview = (items ?? []).reduce((sum, it) => sum + lineTotal(it), 0);
  const withVatPreview = vatVariation === 'with_vat';
  const vatPreview = withVatPreview ? subtotalPreview * 0.16 : 0;
  const deliveryFeePreview = parseFloat(deliveryFee) || 0;
  const grandTotalPreview = subtotalPreview + vatPreview + deliveryFeePreview;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Edit Order #{order.id}</Text>
          <Text style={styles.headerSub}>{order.customer_name}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.headerBtn, styles.headerDoneBtn]}
        >
          <Text style={styles.headerDoneText}>Done</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Order Items ─────────────────────────────────────────────── */}
          <Section title="Order Items" icon="cube-outline">
            {(items ?? []).map((item) => {
              const edit = getItemEdit(item);
              const isExpanded = expandedItem === item.id;
              const isDirty =
                edit.qty !== String(item.quantity) ||
                edit.price !== item.unit_price;

              return (
                <View key={item.id} style={styles.itemCard}>
                  {/* Item row header */}
                  <TouchableOpacity
                    style={styles.itemCardHeader}
                    onPress={() => setExpandedItem(isExpanded ? null : item.id)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.itemCardLeft}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.product_name ?? `Product #${item.product}`}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {item.quantity} × KSh {fmt(parseFloat(item.unit_price))}
                        {isDirty && <Text style={styles.dirtyDot}> ●</Text>}
                      </Text>
                    </View>
                    <View style={styles.itemCardRight}>
                      <Text style={styles.itemTotal}>
                        KSh {fmt(parseFloat(item.line_total))}
                      </Text>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={Colors.gray400}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Expanded edit form */}
                  {isExpanded && (
                    <View style={styles.itemEditForm}>
                      <View style={styles.itemEditRow}>
                        <View style={styles.itemEditField}>
                          <Text style={styles.itemEditLabel}>Quantity</Text>
                          <TextInput
                            style={styles.itemEditInput}
                            value={edit.qty}
                            onChangeText={(v) => setItemField(item.id, 'qty', v)}
                            keyboardType="numeric"
                            selectTextOnFocus
                          />
                        </View>
                        <View style={styles.itemEditField}>
                          <Text style={styles.itemEditLabel}>Unit Price (KSh)</Text>
                          <TextInput
                            style={styles.itemEditInput}
                            value={edit.price}
                            onChangeText={(v) => setItemField(item.id, 'price', v)}
                            keyboardType="numeric"
                            selectTextOnFocus
                          />
                        </View>
                      </View>

                      {/* Live line total preview */}
                      <Text style={styles.lineTotalPreview}>
                        Line total: KSh {fmt(lineTotal(item))}
                      </Text>

                      <View style={styles.itemEditActions}>
                        <TouchableOpacity
                          style={styles.itemDeleteBtn}
                          onPress={() => handleDeleteItem(item)}
                          disabled={removingItem}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.error} />
                          <Text style={styles.itemDeleteText}>Remove</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.itemSaveBtn, !isDirty && styles.itemSaveBtnDisabled]}
                          onPress={() =>
                            saveItem({ itemId: item.id, qty: edit.qty, price: edit.price })
                          }
                          disabled={!isDirty || savingItem}
                        >
                          {savingItem ? (
                            <ActivityIndicator size="small" color={Colors.white} />
                          ) : (
                            <>
                              <Ionicons name="checkmark" size={16} color={Colors.white} />
                              <Text style={styles.itemSaveText}>Save</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Add item button / form */}
            {!showAddItem ? (
              <TouchableOpacity
                style={styles.addItemBtn}
                onPress={() => setShowAddItem(true)}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={styles.addItemText}>Add Product</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.addItemForm}>
                <Text style={styles.addItemFormTitle}>Add Product</Text>

                {/* Product search */}
                <View style={styles.productSearchWrap}>
                  <Ionicons name="search-outline" size={16} color={Colors.gray400} />
                  <TextInput
                    style={styles.productSearch}
                    placeholder="Search products…"
                    placeholderTextColor={Colors.gray400}
                    value={productSearch}
                    onChangeText={setProductSearch}
                    autoCapitalize="none"
                  />
                </View>

                <ScrollView
                  horizontal={false}
                  style={styles.productList}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {filteredProducts.map((p: any) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.productOption,
                        addProductId === p.id && styles.productOptionSelected,
                      ]}
                      onPress={() => {
                        setAddProductId(p.id);
                        setAddPrice(p.retail_price ?? p.wholesale_price ?? '');
                        setProductSearch(p.name);
                      }}
                    >
                      <Text
                        style={[
                          styles.productOptionName,
                          addProductId === p.id && { color: Colors.primary, fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                      <Text style={styles.productOptionPrice}>
                        KSh {fmt(parseFloat(p.retail_price ?? '0'))}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.itemEditRow}>
                  <View style={styles.itemEditField}>
                    <Text style={styles.itemEditLabel}>Quantity</Text>
                    <TextInput
                      style={styles.itemEditInput}
                      value={addQty}
                      onChangeText={setAddQty}
                      keyboardType="numeric"
                      selectTextOnFocus
                    />
                  </View>
                  <View style={styles.itemEditField}>
                    <Text style={styles.itemEditLabel}>Unit Price (KSh)</Text>
                    <TextInput
                      style={styles.itemEditInput}
                      value={addPrice}
                      onChangeText={setAddPrice}
                      keyboardType="numeric"
                      selectTextOnFocus
                    />
                  </View>
                </View>

                <View style={styles.itemEditActions}>
                  <TouchableOpacity
                    style={styles.itemDeleteBtn}
                    onPress={() => { setShowAddItem(false); setAddProductId(null); setProductSearch(''); }}
                  >
                    <Ionicons name="close-outline" size={16} color={Colors.textSecondary} />
                    <Text style={[styles.itemDeleteText, { color: Colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.itemSaveBtn, (!addProductId || !addQty || !addPrice) && styles.itemSaveBtnDisabled]}
                    onPress={() => doAddItem()}
                    disabled={!addProductId || !addQty || !addPrice || addingItem}
                  >
                    {addingItem ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <>
                        <Ionicons name="add" size={16} color={Colors.white} />
                        <Text style={styles.itemSaveText}>Add</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Section>

          {/* ── Totals Preview ───────────────────────────────────────────── */}
          <Section title="Totals Preview" icon="calculator-outline">
            <View style={styles.totalsCard}>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Subtotal</Text>
                <Text style={styles.totalsVal}>
                  KSh {fmt(subtotalPreview)}
                </Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>VAT {withVatPreview ? '(16%)' : ''}</Text>
                <Text style={styles.totalsVal}>
                  KSh {fmt(vatPreview)}
                </Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Delivery Fee</Text>
                <Text style={styles.totalsVal}>
                  KSh {fmt(deliveryFeePreview)}
                </Text>
              </View>
              <View style={[styles.totalsRow, styles.totalsGrandRow]}>
                <Text style={[styles.totalsLabel, styles.totalsGrandLabel]}>
                  Grand Total
                </Text>
                <Text style={[styles.totalsVal, styles.totalsGrandVal]}>
                  KSh {fmt(grandTotalPreview)}
                </Text>
              </View>
              {order && parseFloat(order.amount_paid || '0') > grandTotalPreview && (
                <Text style={styles.overpaymentWarning}>
                  Overpayment detected: amount paid (KSh {fmt(parseFloat(order.amount_paid || '0'))}) exceeds new total.
                </Text>
              )}
              {recalculatingTotals ? (
                <Text style={styles.totalsHint}>Recalculating totals…</Text>
              ) : (
                <Text style={styles.totalsHint}>
                  Preview updates instantly; server totals refresh after each item change.
                </Text>
              )}
            </View>
          </Section>

          {/* ── Order Details ───────────────────────────────────────────── */}
          <Section title="Order Details" icon="document-text-outline">
            <Field
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="07XX XXX XXX"
              keyboardType="phone-pad"
            />
            <Field
              label="Delivery Address"
              value={address}
              onChangeText={setAddress}
              placeholder="Full delivery address"
              multiline
            />
            <Field
              label="Delivery Fee (KSh)"
              value={deliveryFee}
              onChangeText={setDeliveryFee}
              placeholder="0"
              keyboardType="numeric"
            />
            <Field
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Any order notes…"
              multiline
            />

            {/* VAT toggle */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>VAT</Text>
              <View style={styles.vatToggle}>
                {(['without_vat', 'with_vat'] as const).map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.vatOption,
                      vatVariation === opt && styles.vatOptionActive,
                    ]}
                    onPress={() => setVatVariation(opt)}
                  >
                    <Text style={[
                      styles.vatOptionText,
                      vatVariation === opt && styles.vatOptionTextActive,
                    ]}>
                      {opt === 'without_vat' ? 'No VAT' : 'With VAT (16%)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Store toggle */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Store</Text>
              <View style={styles.vatToggle}>
                {['mcdave', 'mombasa', 'offshore'].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.vatOption, store === s && styles.vatOptionActive]}
                    onPress={() => setStore(s)}
                  >
                    <Text style={[
                      styles.vatOptionText,
                      store === s && styles.vatOptionTextActive,
                    ]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveHeaderBtn, savingHeader && { opacity: 0.7 }]}
              onPress={() => saveHeader()}
              disabled={savingHeader}
            >
              {savingHeader ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color={Colors.white} />
                  <Text style={styles.saveHeaderText}>Save Order Details</Text>
                </>
              )}
            </TouchableOpacity>
          </Section>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: 60 },

  // Header
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.white },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  headerDoneBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    width: 'auto',
  },
  headerDoneText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white },

  // Section
  section: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },

  // Item cards
  itemCard: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  itemCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  itemCardLeft: { flex: 1 },
  itemName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  itemMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  dirtyDot: { color: Colors.warning },
  itemCardRight: { alignItems: 'flex-end', gap: 3 },
  itemTotal: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },

  // Item edit form
  itemEditForm: {
    backgroundColor: Colors.gray50 ?? Colors.background,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    gap: Spacing.sm,
  },
  itemEditRow: { flexDirection: 'row', gap: Spacing.sm },
  itemEditField: { flex: 1 },
  itemEditLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  itemEditInput: {
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
    textAlign: 'center',
    fontWeight: '700',
  },
  lineTotalPreview: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
    textAlign: 'right',
  },
  totalsCard: {
    padding: Spacing.md,
    backgroundColor: Colors.gray50 ?? Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalsGrandRow: {
    marginTop: 6,
    marginBottom: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    paddingTop: Spacing.sm,
  },
  totalsLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  totalsGrandLabel: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' },
  totalsVal: { fontSize: 13, color: Colors.textPrimary, fontWeight: '700' },
  totalsGrandVal: { fontSize: 16, fontWeight: '900' },
  totalsHint: { marginTop: 8, fontSize: 11, color: Colors.textSecondary },
  overpaymentWarning: {
    marginTop: 8,
    color: Colors.error,
    fontWeight: '600',
    fontSize: 13,
  },
  itemEditActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  itemDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.error + '50',
    backgroundColor: Colors.errorSurface,
  },
  itemDeleteText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.error },
  itemSaveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  itemSaveBtnDisabled: { backgroundColor: Colors.gray300 },
  itemSaveText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white },

  // Add item
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    justifyContent: 'center',
  },
  addItemText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  addItemForm: {
    padding: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    backgroundColor: Colors.gray50 ?? Colors.background,
  },
  addItemFormTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  productSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.white,
    height: 40,
  },
  productSearch: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },
  productList: { maxHeight: 180 },
  productOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    backgroundColor: Colors.white,
  },
  productOptionSelected: {
    backgroundColor: Colors.primarySurface,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  productOptionName: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, marginRight: Spacing.sm },
  productOptionPrice: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },

  // Header fields
  field: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
  },
  fieldInputMulti: { height: 80, textAlignVertical: 'top', paddingTop: Spacing.sm },
  fieldHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 3 },

  // VAT / store toggle
  vatToggle: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  vatOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  vatOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  vatOptionText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  vatOptionTextActive: { color: Colors.primary, fontWeight: '700' },

  // Save button
  saveHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    margin: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  saveHeaderText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.white },
});
