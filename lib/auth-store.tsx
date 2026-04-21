/**
 * Local auth store for the anti-fraud app.
 * Stores a complete profile (name, phone, emergency contact) in AsyncStorage.
 * No password required — the app is a personal safety tool, not a multi-user platform.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "a30-auth-profile-v1";
const ONBOARDING_KEY = "a30-onboarding-done-v1";

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export interface AuthProfile {
  name: string;
  phone: string;
  emergencyContact?: EmergencyContact;
  createdAt: string;
}

interface AuthState {
  profile: AuthProfile | null;
  onboardingDone: boolean;
  loading: boolean;
  login: (name: string, phone: string, emergencyContact?: EmergencyContact) => Promise<void>;
  updateProfile: (patch: Partial<Omit<AuthProfile, "createdAt">>) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [raw, done] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(ONBOARDING_KEY),
        ]);
        if (raw) setProfile(JSON.parse(raw) as AuthProfile);
        if (done === "1") setOnboardingDone(true);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const login = useCallback(async (name: string, phone: string, emergencyContact?: EmergencyContact) => {
    const p: AuthProfile = {
      name: name.trim(),
      phone: phone.trim(),
      emergencyContact,
      createdAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    setProfile(p);
  }, []);

  const updateProfile = useCallback(async (patch: Partial<Omit<AuthProfile, "createdAt">>) => {
    setProfile((current) => {
      if (!current) return current;
      const updated = { ...current, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(ONBOARDING_KEY);
    setProfile(null);
    setOnboardingDone(false);
  }, []);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    setOnboardingDone(true);
  }, []);

  return (
    <AuthContext.Provider value={{ profile, onboardingDone, loading, login, updateProfile, logout, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthStore() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthStore must be used within AuthProvider");
  return ctx;
}
