// Minimal mock for libp2p-noise used in tests
function noise(opts) {
  return {
    staticNoiseKey: opts && opts.staticNoiseKey,
    createSession: () => ({
      encrypt: (data) => data,
      decrypt: (data) => data,
    }),
  };
}

module.exports = { noise };
