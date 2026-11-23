package com.nexusagent.bootloaderunlock.oem;

import com.nexusagent.bootloaderunlock.device.DeviceInfo;
import com.nexusagent.bootloaderunlock.logging.UnlockLogger;
import com.nexusagent.bootloaderunlock.usb.FastbootTransport;

import java.io.IOException;

/**
 * Xiaomi requires the user to:
 *  1. Log in to their Mi Account on the device
 *  2. Apply for unlock permission via mi.com/unlock (waiting period may apply)
 *  3. Use Mi Unlock Tool *OR* standard fastboot flashing unlock after permission is granted
 *
 * On devices with permission already granted, standard 'fastboot flashing unlock' works.
 */
public class XiaomiModule extends OemModule {

    private static final String TAG = "XiaomiModule";
    private static final String PORTAL_URL = "https://en.miui.com/unlock/";

    public XiaomiModule(DeviceInfo deviceInfo, UnlockLogger logger) {
        super(deviceInfo, logger);
    }

    @Override
    public String getUnlockMethodDescription() {
        return "Xiaomi: Mi Account unlock permission required; then standard fastboot unlock";
    }

    @Override
    public boolean requiresTokenRetrieval() { return true; }

    @Override
    public String getUnlockPortalUrl() { return PORTAL_URL; }

    @Override
    public void performUnlock(FastbootTransport fastboot) throws IOException {
        logger.info(TAG, "Attempting Xiaomi unlock via fastboot flashing unlock…");
        logger.warn(TAG,
                "Xiaomi requires Mi Account unlock permission. "
                        + "If this fails, visit " + PORTAL_URL);
        try {
            fastboot.flashingUnlock();
            logger.success(TAG, "Xiaomi unlock accepted");
        } catch (IOException e) {
            logger.error(TAG, "Unlock rejected – Mi Account permission not granted");
            throw new IOException(
                    "Xiaomi bootloader unlock requires Mi Account permission from "
                            + PORTAL_URL + ". " + e.getMessage());
        }
    }
}
