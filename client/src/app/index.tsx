
import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  Alert,
  ScrollView,
} from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../config/firebase";

export default function HomeScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

  async function handleLogin() {
    setLoading(true);
    setMessage("");
    try {
      const result = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const idToken = await result.user.getIdToken();
      setToken(idToken);

      // Authenticate with backend using the verified Firebase ID token
      try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setMessage(`Login successful! Welcome, ${data.data?.name || data.data?.email || "User"}!`);
        } else {
          setMessage(`Backend error (${response.status}): ${data.message || "Failed to authenticate"}`);
        }
      } catch (backendErr: any) {
        setMessage(`Firebase login succeeded, but backend server unreachable: ${backendErr.message}`);
      }
    } catch (error: any) {
      setMessage(error.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ShareSync</Text>
      <Text style={styles.subtitle}>Firebase Authentication Test</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Logging in..." : "Login with Firebase"}
        </Text>
      </Pressable>

      {!!message && <Text style={styles.message}>{message}</Text>}

      {!!token && (
        <View style={styles.tokenContainer}>
          <Text style={styles.tokenTitle}>
            Firebase ID Token — Copy for Postman
          </Text>
          <Text selectable style={styles.token}>
            {token}
          </Text>
        </View>
      )}
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
    fontSize: 30,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 24,
  },
  input: {
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  button: {
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 8,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  message: {
    marginTop: 16,
  },
  tokenContainer: {
    marginTop: 20,
    width: "100%",
    maxWidth: 600,
  },
  tokenTitle: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  token: {
    fontSize: 12,
    padding: 12,
    backgroundColor: "#eee",
    color: "#111",
  },
});
