import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  ScrollView,
} from "react-native";
import { useAuth } from "@/context/AuthContext";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

  async function handleLogin() {
    if (!email.trim() || !password) {
      setMessage("Please enter both email and password.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const userCredential = await login(email, password);
      const idToken = await userCredential.user.getIdToken();
      setToken(idToken);

      // Authenticate with backend using verified Firebase ID token
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
          setMessage(`Backend notice (${response.status}): ${data.message || "Authenticated with Firebase"}`);
        }
      } catch (backendErr: any) {
        setMessage(`Firebase login succeeded (backend server unreachable: ${backendErr.message})`);
      }
    } catch (error: any) {
      setMessage(error.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ShareSync</Text>
      <Text style={styles.subtitle}>Sign In to your Account</Text>

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
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? "Signing in..." : "Sign In with Firebase"}
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
    color: "#666",
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
    textAlign: "center",
    maxWidth: 400,
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
