const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);
const { resolver: { assetExts } } = defaultConfig;

const config = {
  resolver: {
    assetExts: [...assetExts, 'tflite'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
