# RayNeo Mercury Android SDK (optional, not committed)

Put `MercuryAndroidSDK.aar` here to build both APKs with RayNeo's own temple-gesture dispatcher,
X3 detection, wearing state and MirroringView. `*.aar` files in this folder are git-ignored because
the SDK is RayNeo's proprietary software and this repository is public.

For GitHub Actions builds (secrets are limited to 48 KB, the AAR is larger), use one of:

- **Encrypted copy:** `gpg --symmetric --cipher-algo AES256 -o MercuryAndroidSDK.aar.gpg MercuryAndroidSDK.aar`,
  commit `MercuryAndroidSDK.aar.gpg` here, and add the passphrase as the repository secret `RAYNEO_SDK_PASSPHRASE`.
- **Private link:** add a direct download URL for the AAR as the repository secret `RAYNEO_SDK_URL`.

The build log then shows "RayNeo SDK: included".
