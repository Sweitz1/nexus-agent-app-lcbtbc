# Third-party notices

Halo includes code adapted from the following projects.

## x3bluetooth

- Project: https://github.com/Dun-John/x3bluetooth
- Used in: `android/app/src/main/java/com/halo/agent/X3.java` and `android/glasses/src/main/java/com/halo/glasses/X3.java` (RayNeo X3 Pro detection by touchpad name, both-eye mirror, temple-touchpad gestures). The PixelCopy fallback and Halo-specific wiring are Halo's own.
- Also informed: the RayNeo launcher flag (`com.rayneo.mercury.app`) and the X3 Pro Bluetooth notes in the app and README.

```
MIT License

Copyright (c) 2026 X3 Bluetooth contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Other references (no code copied)

- [TAPLINKX3](https://github.com/informalTechCode/TAPLINKX3) (Apache-2.0): its MercurySDK reference confirmed the 1280×480 two-eye layout and the RayNeo gesture conventions (swipe to move, tap to select, double-tap to go back).
- [rayneo-x3-spatial-sdk](https://github.com/AlexSKuznetsov/rayneo-x3-spatial-sdk) (Apache-2.0): confirms that the temple touchpad arrives as ordinary touch events. Its 6DoF tracking needs RayNeo's own OpenXR runtime libraries, which can't be bundled, so Halo pins the glance card with the built-in rotation sensor (3DoF) instead.
