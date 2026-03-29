import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAuthStore } from '../../../src/store/authStore';
import { Card } from '../../../src/components/ui/Card';
import { Badge } from '../../../src/components/ui/Badge';
import { Button } from '../../../src/components/ui/Button';
import { Colors, FontSize, Spacing, BorderRadius } from '../../../src/constants/colors';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar + name card */}
        <Card style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={[styles.avatar, user?.is_admin && { backgroundColor: Colors.primaryDark }]}>
              <Text style={styles.avatarText}>
                {(user?.user?.first_name?.charAt(0) ?? 'U').toUpperCase()}
              </Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroName} numberOfLines={1}>
                {user?.user?.first_name} {user?.user?.last_name}
              </Text>
              <Badge
                label={user?.is_admin ? 'Administrator' : 'Salesperson'}
                variant={user?.is_admin ? 'warning' : 'primary'}
              />
              {user?.department && <Text style={styles.heroDept}>{user.department}</Text>}
            </View>
          </View>
        </Card>

        {/* Details */}
        <Card style={styles.detailsCard}>
          <ProfileRow icon="person-outline"        label="Username"    value={user?.user?.username ?? '—'} />
          <ProfileRow icon="mail-outline"           label="Email"       value={user?.user?.email ?? '—'} />
          <ProfileRow icon="call-outline"           label="Phone"       value={user?.phone ?? '—'} />
          <ProfileRow icon="business-outline"       label="Department"  value={user?.department ?? '—'} />
          <ProfileRow icon="card-outline"           label="National ID" value={user?.national_id ?? '—'} />
          <ProfileRow
            icon="calendar-outline"
            label="Join Date"
            value={user?.join_date ? format(new Date(user.join_date), 'dd MMM yyyy') : '—'}
          />
          <ProfileRow icon="person-circle-outline"  label="Gender"      value={user?.gender ?? '—'} last />
        </Card>

        <Button
          onPress={handleLogout}
          label="Sign Out"
          variant="danger"
          icon="log-out-outline"
          fullWidth
          style={styles.signOutBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({
  icon, label, value, last,
}: {
  icon: string; label: string; value: string; last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Ionicons name={icon as any} size={16} color={Colors.primary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  content: { padding: Spacing.md, paddingBottom: 60 },
  heroCard: { marginBottom: Spacing.md },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: Colors.primary },
  heroInfo: { flex: 1, gap: 6 },
  heroName: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary },
  heroDept: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },

  detailsCard: { marginBottom: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: Spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  rowLabel: { width: 100, fontSize: FontSize.sm, color: Colors.textSecondary },
  rowValue: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '500' },

  signOutBtn: { marginTop: Spacing.sm },
});
