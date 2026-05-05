const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const webStubs = {
  "react-native-webrtc": path.resolve(__dirname, "stubs/react-native-webrtc.js"),
  "react-native-maps": path.resolve(__dirname, "stubs/react-native-maps.js"),
};

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && webStubs[moduleName]) {
    return {
      filePath: webStubs[moduleName],
      type: "sourceFile",
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
