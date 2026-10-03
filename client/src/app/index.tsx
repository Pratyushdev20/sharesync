import { StyleSheet, Text, View } from "react-native";
import { auth } from "../config/firebase";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ShareSync</Text>
      <Text>Firebase Connected</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    marginBottom: 10,
  },
});