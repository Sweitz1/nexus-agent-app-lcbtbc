#!/usr/bin/env bash
# Sets up the emulator like a Moto G (2025) and runs the device smoke test.
set -u
OUT="${1:-device-test-out}"; mkdir -p "$OUT"
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
# Moto G (2025): 6.7" HD+ 720x1604; Motorola ships a slightly larger default font size.
adb shell wm size 720x1604
adb shell wm density 280
adb shell settings put system font_scale 1.1
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard || true
adb install -r -g android/app/build/outputs/apk/debug/app-debug.apk
adb install -r -g android/glasses/build/outputs/apk/debug/glasses-debug.apk
adb logcat -c
node tests/device/smoke.mjs "$OUT"
