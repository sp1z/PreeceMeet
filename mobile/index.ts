import './src/polyfills';
import { installGlobalErrorHandler } from './src/errorReporter';

// Must run before anything that might throw a JS error during init —
// otherwise React Native's default handler fires RCTFatal and aborts.
installGlobalErrorHandler();

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
