import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'process.env.BUILD_LOCAL ---',
  appName: 'process.env.BUILD_LOCAL ---',
  webDir: 'dist',
  plugins: {
    SpeechRecognition: {}
  }
}

export default config
