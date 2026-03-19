import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoreLocation, CustomerCategory } from '../types';

interface LastOrderState {
  lastCustomerId: number | null;
  lastStore: StoreLocation | null;
  lastCategory: CustomerCategory | null;
  setLastOrderContext: (data: Partial<LastOrderState>) => void;
  clearContext: () => void;
}

export const useLastOrderStore = create<LastOrderState>()(
  persist(
    (set) => ({
      lastCustomerId: null,
      lastStore: null,
      lastCategory: null,
      setLastOrderContext: (data) => set((state) => ({ ...state, ...data })),
      clearContext: () => set({ lastCustomerId: null, lastStore: null, lastCategory: null }),
    }),
    {
      name: 'last-order-context',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);