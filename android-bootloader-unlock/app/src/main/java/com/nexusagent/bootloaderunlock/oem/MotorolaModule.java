package com.nexusagent.bootloaderunlock.oem;

import com.nexusagent.bootloaderunlock.device.DeviceInfo;
import com.nexusagent.bootloaderunlock.logging.UnlockLogger;
import com.nexusagent.bootloaderunlock.usb.FastbootTransport;

import java.io.IOException;

/**
 * Motorola requires the user to:
 *  1. Retrieve the device's unlock key via 'fastboot oem get_unlock_data'
 *  2. Submit it to Motorola's unlock portal to get an unlock code
 *  3. Apply the code with 'fastboot oem unlock <code>'
 */
public class MotorolaModule extends OemModule {

    private static final String TAG = "MotorolaModule";
    private static final String PORTAL_URL =
            "https://motorola-global-portal.custhelp.com/app/standalone/bootloader/unlock-your-device-a";

    public MotorolaModule(DeviceInfo deviceInfo, UnlockLogger logger) {
        super(deviceInfo, logger);
    }

    @Override
    public String getUnlockMethodDescription() {
        return "Motorola: retrieve unlock code from portal, then apply via fastboot";
    }

    @Override
    public boolean requiresTokenRetrieval() { return true; }

    @Override
    public String getUnlockPortalUrl() { return PORTAL_URL; }

    /**
     * Reads and logs the unlock data that the user must submit to Motorola's portal.
     * Returns the unlock data string.
     */
    public String getUnlockData(FastbootTransport fastboot) throws IOException {
        logger.info(TAG, "Fetching Motorola unlock data…");
        String data = fastboot.command("oem get_unlock_data");
        logger.success(TAG, "Unlock data: " + data);
        logger.warn(TAG,
                "Submit this data to: " + PORTAL_URL
                        + "  — then call applyUnlockCode() with the received code.");
        return data;
    }

    /** Applies the code received from Motorola's portal. */
    public void applyUnlockCode(FastbootTransport fastboot, String code) throws IOException {
        logger.info(TAG, "Applying Motorola unlock code…");
        fastboot.command("oem unlock " + code);
        logger.success(TAG, "Motorola unlock code applied successfully");
    }

    @Override
    public void performUnlock(FastbootTransport fastboot) throws IOException {
        // Try the standard path first; Motorola also honours 'flashing unlock' on
        // newer devices (Android 10+) when OEM Unlocking is already enabled.
        try {
            logger.info(TAG, "Trying standard flashing unlock first…");
            fastboot.flashingUnlock();
        } catch (IOException e) {
            logger.warn(TAG, "Standard unlock failed, OEM token path required: " + e.getMessage());
            throw new IOException(
                    "Motorola device requires an unlock code from " + PORTAL_URL
                            + ". Use getUnlockData() then applyUnlockCode().");
        }
    }
}
