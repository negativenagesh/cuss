module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 57) already injects react-native-worklets/plugin.
    // Adding it here too would run it twice and crash the app natively.
    presets: ['babel-preset-expo'],
  };
};
