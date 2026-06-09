package com.nexusagent.bootloaderunlock.unlock;

import android.content.Context;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;

import com.nexusagent.bootloaderunlock.device.DeviceDetector;
import com.nexusagent.bootloaderunlock.device.DeviceInfo;
import com.nexusagent.bootloaderunlock.logging.UnlockLogger;
import com.nexusagent.bootloaderunlock.oem.MotorolaModule;
import com.nexusagent.bootloaderunlock.oem.OemModule;
import com.nexusagent.bootloaderunlock.oem.SonyModule;
import com.nexusagent.bootloaderunlock.usb.AdbRsaKey;
import com.nexusagent.bootloaderunlock.usb.AdbTransport;
import com.nexusagent.bootloaderunlock.usb.FastbootTransport;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Orchestrates the full bootloader unlock workflow across all steps.
 * Runs on a single background thread; UI receives events via {@link UnlockCallback}.
 */
public class UnlockWizard {

    private static final String TAG = "UnlockWizard";

    private final Context ctx;
    private final UsbManager usbManager;
    private final UnlockLogger logger;
    private final UnlockCallback callback;
    private final DeviceDetector detector;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private volatile boolean cancelled = false;
    private DeviceInfo currentDevice;
    private AdbRsaKey rsaKey;

    public UnlockWizard(Context ctx, UnlockLogger logger, UnlockCallback callback) {
        this.ctx        = ctx.getApplicationContext();
        this.usbManager = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
        this.logger     = logger;
        this.callback   = callback;
        this.detector   = new DeviceDetector(usbManager);
    }

    /** Starts the full unlock sequence asynchronously. */
    public void start(UsbDevice targetDevice) {
        cancelled = false;
        executor.submit(() -> runSequence(targetDevice));
    }

    public void cancel() {
        cancelled = true;
        logger.warn(TAG, "Unlock sequence cancelled by user");
    }

    // ----- Main sequence -----

    private void runSequence(UsbDevice targetDevice) {
        try {
            rsaKey = AdbRsaKey.load(ctx);
        } catch (Exception e) {
            callback.onUnlockFailed("Failed to initialise RSA key: " + e.getMessage());
            return;
        }

        try {
            // Step 1: Connect / detect
            step(UnlockStep.CONNECT_DEVICE);
            currentDevice = detectDevice(targetDevice);
            callback.onDeviceDetected(currentDevice);
            complete(UnlockStep.CONNECT_DEVICE);

            if (cancelled) return;

            // Step 2: Verify
            step(UnlockStep.DETECT_AND_VERIFY);
            verifyDevice();
            complete(UnlockStep.DETECT_AND_VERIFY);

            if (cancelled) return;

            // Step 3: Get to Fastboot
            step(UnlockStep.REBOOT_FASTBOOT);
            DeviceInfo fastbootDevice = ensureFastbootMode(targetDevice);
            complete(UnlockStep.REBOOT_FASTBOOT);

            if (cancelled) return;

            // Step 4: Check ability
            step(UnlockStep.CHECK_UNLOCK_ABILITY);
            checkUnlockAbility(fastbootDevice);
            complete(UnlockStep.CHECK_UNLOCK_ABILITY);

            if (cancelled) return;

            // Step 5: Unlock
            step(UnlockStep.EXECUTE_UNLOCK);
            executeUnlock(fastbootDevice);
            complete(UnlockStep.EXECUTE_UNLOCK);

            // Step 6: Done
            step(UnlockStep.COMPLETE);
            complete(UnlockStep.COMPLETE);
            callback.onUnlockSuccess();

        } catch (CancelException e) {
            logger.warn(TAG, "Cancelled");
        } catch (Exception e) {
            logger.error(TAG, "Unexpected error: " + e.getMessage());
            callback.onUnlockFailed(e.getMessage());
        }
    }

    // ----- Step implementations -----

    private DeviceInfo detectDevice(UsbDevice target) throws IOException {
        if (target != null) {
            DeviceInfo.ConnectionMode mode = detector.classifyDevice(target);
            logger.info(TAG, "Target device mode: " + mode);
            return new DeviceInfo(target, mode);
        }
        // Scan all connected USB devices
        List<DeviceInfo> devices = detector.detectDevices();
        if (devices.isEmpty()) throw new IOException("No Android device found via USB");
        DeviceInfo best = devices.get(0);
        logger.success(TAG, "Found: " + best.displayName() + " [" + best.mode + "]");
        return best;
    }

    private void verifyDevice() throws IOException {
        if (currentDevice.mode == DeviceInfo.ConnectionMode.ADB) {
            logger.info(TAG, "Device in ADB mode – verifying communication");
            AdbTransport adb = new AdbTransport(usbManager, rsaKey, logger);
            try {
                adb.connect(currentDevice.usbDevice);
                String serial = adb.shellCommand("getprop ro.serialno").trim();
                if (!serial.isEmpty()) currentDevice.serial = serial;
                currentDevice.model        = getOrDefault(adb.shellCommand("getprop ro.product.model"), currentDevice.model);
                currentDevice.manufacturer = getOrDefault(adb.shellCommand("getprop ro.product.manufacturer"), currentDevice.manufacturer);
                currentDevice.androidVersion = adb.shellCommand("getprop ro.build.version.release").trim();
                logger.success(TAG, "ADB verified: " + currentDevice.displayName()
                        + " Android " + currentDevice.androidVersion);
            } finally {
                adb.close();
            }
        } else if (currentDevice.mode == DeviceInfo.ConnectionMode.FASTBOOT) {
            logger.info(TAG, "Device already in Fastboot mode – skipping ADB verify");
        } else {
            throw new IOException("Device mode not recognised");
        }
    }

    /** If device is in ADB mode, reboot to bootloader. Waits for Fastboot to appear. */
    private DeviceInfo ensureFastbootMode(UsbDevice originalTarget) throws IOException {
        if (currentDevice.mode == DeviceInfo.ConnectionMode.FASTBOOT) {
            logger.info(TAG, "Already in Fastboot mode");
            return currentDevice;
        }

        logger.info(TAG, "Sending 'adb reboot bootloader'…");
        AdbTransport adb = new AdbTransport(usbManager, rsaKey, logger);
        try {
            adb.connect(currentDevice.usbDevice);
            adb.shellCommand("reboot bootloader");
        } finally {
            adb.close();
        }

        logger.info(TAG, "Waiting for Fastboot mode (up to 30 s)…");
        long deadline = System.currentTimeMillis() + 30_000;
        while (System.currentTimeMillis() < deadline) {
            if (cancelled) throw new CancelException();
            Thread.sleep(2_000);
            List<DeviceInfo> devices = detector.detectDevices();
            for (DeviceInfo d : devices) {
                if (d.mode == DeviceInfo.ConnectionMode.FASTBOOT) {
                    logger.success(TAG, "Fastboot mode detected");
                    currentDevice = d;
                    return d;
                }
            }
        }
        throw new IOException("Device did not enter Fastboot mode within 30 seconds");
    }

    private void checkUnlockAbility(DeviceInfo fastbootDevice) throws IOException {
        FastbootTransport fb = new FastbootTransport(usbManager, logger);
        try {
            fb.connect(fastbootDevice.usbDevice);
            boolean canUnlock = fb.checkUnlockAbility();
            fastbootDevice.unlockAbility = canUnlock ? "1" : "0";
            if (!canUnlock) {
                throw new IOException(
                        "unlock_ability=0: OEM Unlocking is not enabled in Developer Options, "
                                + "or the manufacturer has blocked bootloader unlocking.");
            }
            logger.success(TAG, "Device can be unlocked (unlock_ability=1)");
        } finally {
            fb.close();
        }
    }

    private void executeUnlock(DeviceInfo fastbootDevice) throws IOException {
        OemModule oem = OemModule.forDevice(fastbootDevice, logger);
        logger.info(TAG, "OEM module: " + oem.getUnlockMethodDescription());

        if (oem.requiresTokenRetrieval()) {
            // Notify UI that manual token retrieval step is needed
            FastbootTransport fb = new FastbootTransport(usbManager, logger);
            try {
                fb.connect(fastbootDevice.usbDevice);
                String deviceData = "";
                if (oem instanceof MotorolaModule) {
                    deviceData = ((MotorolaModule) oem).getUnlockData(fb);
                } else if (oem instanceof SonyModule) {
                    deviceData = ((SonyModule) oem).getDeviceInfo(fb);
                }
                callback.onOemTokenRequired(
                        fastbootDevice.manufacturer,
                        oem.getUnlockPortalUrl(),
                        deviceData);
            } finally {
                fb.close();
            }
            // Pause here – user must retrieve token out-of-band.
            // The UI can call applyOemUnlockCode() once they have it.
            logger.warn(TAG, "Paused: waiting for OEM unlock code");
            return;
        }

        // Standard unlock path
        callback.onAwaitingUserConfirmation(
                "Confirm the bootloader unlock on the TARGET device screen when prompted.");
        FastbootTransport fb = new FastbootTransport(usbManager, logger);
        try {
            fb.connect(fastbootDevice.usbDevice);
            oem.performUnlock(fb);
        } finally {
            fb.close();
        }
    }

    /** Called by the UI after the user retrieves and enters an OEM unlock code. */
    public void applyOemUnlockCode(String code) {
        executor.submit(() -> {
            FastbootTransport fb = new FastbootTransport(usbManager, logger);
            try {
                fb.connect(currentDevice.usbDevice);
                OemModule oem = OemModule.forDevice(currentDevice, logger);
                if (oem instanceof MotorolaModule) {
                    ((MotorolaModule) oem).applyUnlockCode(fb, code);
                } else if (oem instanceof SonyModule) {
                    ((SonyModule) oem).applyUnlockCode(fb, code);
                } else {
                    fb.command("oem unlock " + code);
                }
                complete(UnlockStep.EXECUTE_UNLOCK);
                step(UnlockStep.COMPLETE);
                complete(UnlockStep.COMPLETE);
                callback.onUnlockSuccess();
            } catch (IOException e) {
                callback.onStepFailed(UnlockStep.EXECUTE_UNLOCK, e.getMessage());
                callback.onUnlockFailed(e.getMessage());
            } finally {
                fb.close();
            }
        });
    }

    // ----- Helpers -----

    private void step(UnlockStep s) throws CancelException {
        if (cancelled) throw new CancelException();
        logger.info(TAG, ">>> " + s.label);
        callback.onStepStarted(s);
    }

    private void complete(UnlockStep s) {
        logger.success(TAG, "✓ " + s.label);
        callback.onStepCompleted(s);
    }

    private String getOrDefault(String value, String defaultValue) {
        return (value != null && !value.trim().isEmpty()) ? value.trim() : defaultValue;
    }

    private static class CancelException extends Exception {}
}
