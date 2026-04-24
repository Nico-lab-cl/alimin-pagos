import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cl.aliminspa.pagos',
  appName: 'Pagos Alimin',
  webDir: 'public',
  bundledWebRuntime: false,
  server: {
    url: 'https://pagos.aliminspa.cl',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
