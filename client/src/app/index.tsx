import { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useSync, useSyncEvents } from "@/context/SyncContext";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { OfflineEntry, offlineService } from "@/services/offline.service";
import { syncApi } from "@/services/sync.service";
import { ProfileModal } from "@/components/profile/ProfileModal";

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  const { unreadCount, isOnline } = useSync();
  const [offline, setOffline] = useState<OfflineEntry[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [offlineMsg, setOfflineMsg] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  const loadExtras = useCallback(() => {
    offlineService.list().then(setOffline).catch(() => {});
    syncApi.listDevices().then(setDevices).catch(() => {});
  }, []);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  useSyncEvents((e) => {
    if (e.type === "reset" || ("resourceType" in e && e.resourceType === "file")) loadExtras();
  });

  async function openOffline(entry: OfflineEntry) {
    try {
      await offlineService.open(entry);
    } catch (err: any) {
      setOfflineMsg(err?.message || "Could not open the file.");
    }
  }

  async function removeOffline(entry: OfflineEntry) {
    await offlineService.remove(entry.id);
    loadExtras();
  }

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ShareSync</Text>
      <Text style={styles.subtitle}>Secure File & Content Sharing</Text>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>Authenticated Session</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Email:</Text>
          <Text style={styles.value}>{user?.email || "Unknown"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>UID:</Text>
          <Text style={styles.value} numberOfLines={1}>
            {user?.uid || "Unknown"}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Email Verified:</Text>
          <Text style={styles.value}>
            {user?.emailVerified ? "Yes" : "No"}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>Sync</Text>
        <SyncStatusBadge />
        <Text style={styles.hint}>
          {isOnline
            ? "Changes from your other devices appear automatically."
            : "You're offline. Notes you edit are saved here and sync when you reconnect."}
        </Text>
        {devices.length > 0 && (
          <Text style={styles.hint}>
            {devices.length} device{devices.length === 1 ? "" : "s"} synced with this account
          </Text>
        )}
      </View>

      <Pressable style={styles.filesButton} onPress={() => router.push("/explore")}>
        <Text style={styles.filesButtonText}>Open File Explorer →</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => router.push("/notifications")}>
        <Text style={styles.secondaryButtonText}>
          🔔 Notifications{unreadCount > 0 ? ` (${unreadCount} unread)` : ""}
        </Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => setProfileOpen(true)}>
        <Text style={styles.secondaryButtonText}>👤 Profile & account</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => router.push("/notes")}>
        <Text style={styles.secondaryButtonText}>📝 Notes & documents</Text>
      </Pressable>

      {offlineService.isSupported() && (
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Available offline</Text>
          {offline.length === 0 ? (
            <Text style={styles.hint}>
              Tap 📥 on a file in Files to keep a copy on this phone. It stays up to date automatically.
            </Text>
          ) : (
            offline.map((entry) => (
              <View key={entry.id} style={styles.offlineRow}>
                <Pressable style={{ flex: 1 }} onPress={() => openOffline(entry)}>
                  <Text style={styles.value} numberOfLines={1}>📄 {entry.name}</Text>
                  <Text style={styles.small}>Version {entry.version} • checked {new Date(entry.checkedAt).toLocaleString()}</Text>
                </Pressable>
                <Pressable onPress={() => removeOffline(entry)} hitSlop={8}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))
          )}
          {!!offlineMsg && <Text style={styles.hint}>{offlineMsg}</Text>}
        </View>
      )}

      <Pressable
        style={[styles.logoutButton, loggingOut && styles.buttonDisabled]}
        onPress={handleLogout}
        disabled={loggingOut}
      >
        <Text style={styles.logoutButtonText}>
          {loggingOut ? "Signing out..." : "Sign Out"}
        </Text>
      </Pressable>

      <ProfileModal visible={profileOpen} onClose={() => { setProfileOpen(false); loadExtras(); }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#1e3a8a",
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    marginBottom: 24,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    color: "#0f172a",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },
  label: {
    fontWeight: "600",
    color: "#475569",
    fontSize: 14,
  },
  value: {
    color: "#0f172a",
    fontSize: 14,
    flexShrink: 1,
  },
  hint: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 6,
  },
  small: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 2,
  },
  offlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  removeText: {
    color: "#b91c1c",
    fontSize: 13,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: "100%",
    maxWidth: 480,
    alignItems: "center",
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: "#1d4ed8",
    fontWeight: "600",
  },
  filesButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: "100%",
    maxWidth: 480,
    alignItems: "center",
    marginBottom: 12,
  },
  filesButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  logoutButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: "100%",
    maxWidth: 480,
    alignItems: "center",
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  logoutButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});
