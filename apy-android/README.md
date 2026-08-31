# APY — Android Mobile App (Capacitor 7)

<div align="center">
  <img src="src/assets/icon.png" width="100" height="100" alt="APY Logo" style="border-radius: 20px;" />
  <h2><strong>APY Android App</strong></h2>
  <p>Native Android wrapper for the APY collegiate attendance ledger and bunk forecaster.</p>

  <p>
    <a href="https://github.com/Charan610/APY/raw/main/apy-android/APY.apk">
      <img src="https://img.shields.io/badge/Download-APY.apk-gold?style=for-the-badge&logo=android&logoColor=black" alt="Download APK" />
    </a>
    <img src="https://img.shields.io/badge/Capacitor-v7.1.2-blue?style=for-the-badge&logo=capacitor" alt="Capacitor" />
    <img src="https://img.shields.io/badge/Platform-Android%2014+-green?style=for-the-badge&logo=android" alt="Android" />
  </p>
</div>

---

## 📥 Direct APK Download
You can download the compiled Android APK directly:
- **Direct Link**: [**Download APY.apk**](https://github.com/Charan610/APY/raw/main/apy-android/APY.apk)
- **File in Folder**: `APY.apk`

---

## 📱 Mobile-Specific Features
- **Collegiate Graduation Cap Icon**: Clean, high-density adaptive launcher icons matching the brand identity.
- **Hardware Back Button**: Native back button interception with double-press to exit protection.
- **Tactile Haptic Feedback**: Light haptic ticks when marking periods Present/Absent.
- **Persistent Native Storage**: Token and user credentials persist across app restarts using `@capacitor/preferences`.
- **Live Production Sync**: Configured out of the box to connect with `https://apy-i1s1.vercel.app/api`.
- **Inline Server Config**: Built-in drawer on the login screen to inspect and test backend server connectivity.

---

## 🛠️ Building From Source

### Prerequisites
- Node.js 18+ & npm
- OpenJDK 21 (`export JAVA_HOME=/opt/homebrew/opt/openjdk@21`)
- Android SDK (`export ANDROID_HOME=$HOME/Library/Android/sdk`)

### Commands
```bash
# 1. Install dependencies & build web assets
npm install
npm run build

# 2. Sync to Android container
npx cap sync android

# 3. Compile APK with Gradle
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME=$HOME/Library/Android/sdk
cd android
./gradlew assembleDebug

# Output APK: android/app/build/outputs/apk/debug/app-debug.apk
```

### Install to Device via ADB
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```
