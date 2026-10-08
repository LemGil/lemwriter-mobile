import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
     appId: process.env.BUILD_LOCAL === '1' ? 'com.lemgil.lemwriter.local' : 'com.lemgil.lemwriter',
     appName: process.env.BUILD_LOCAL === '1' ? 'LemWriter Local' : 'LemWriter',
  webDir: 'dist',
  plugins: {
    SpeechRecognition: {}
  }
}

export default config
