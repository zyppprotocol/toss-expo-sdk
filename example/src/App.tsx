import { Text, View, StyleSheet } from 'react-native';

// Example: TOSS Expo SDK example app
// import { createClient } from 'toss-expo-sdk';
// const client = createClient({ projectId: 'my-app', mode: 'devnet' });

export default function App() {
  return (
    <View style={styles.container}>
      <Text>TOSS Expo SDK Initialized</Text>
      <Text style={styles.subtitle}>Ready for offline transactions</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 12,
    color: '#666',
  },
});
