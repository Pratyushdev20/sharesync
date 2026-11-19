import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { ExternalLink } from "@/components/external-link";

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState<boolean>(false);

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

      <Pressable
        style={styles.filesButton}
        onPress={() => router.push("/explore")}
      >
        <Text style={styles.filesButtonText}>Open File Explorer →</Text>
      </Pressable>

      <Pressable
        style={[styles.logoutButton, loggingOut && styles.buttonDisabled]}
        onPress={handleLogout}
        disabled={loggingOut}
      >
        <Text style={styles.logoutButtonText}>
          {loggingOut ? "Signing out..." : "Sign Out"}
        </Text>
      </Pressable>

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
