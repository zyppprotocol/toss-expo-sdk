// Minimal in-memory mock of expo-secure-store for tests
const store = new Map();

const SecureStore = {
  async setItemAsync(key, value) {
    store.set(key, value);
    return true;
  },
  async getItemAsync(key) {
    return store.has(key) ? store.get(key) : null;
  },
  async deleteItemAsync(key) {
    store.delete(key);
    return true;
  },
};

module.exports = SecureStore;
