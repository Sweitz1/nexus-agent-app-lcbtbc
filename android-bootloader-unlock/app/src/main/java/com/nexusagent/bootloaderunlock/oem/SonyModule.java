package com.nexusagent.bootloaderunlock.oem;

import com.nexusagent.bootloaderunlock.device.DeviceInfo;
import com.nexusagent.bootloaderunlock.logging.UnlockLogger;
import com.nexusagent.bootloaderunlock.usb.FastbootTransport;

import java.io.IOException;

/**
 * Sony Xperia uses a different unlock flow:
 *  1. Read IMEI / device ID: 'fastboot oem deviceinfo'
 *  2. Submit IMEI to Sony's developer portal to get an unlock code
 *  3. Apply: 'fastboot oem unlock 0x<code>'
 */
public class SonyModule extends OemModule {

    private static final String TAG = "SonyModule";
    private static final String PORTAL_URL =
            "https://developer.sony.com/open-source/aosp-on-xperia-open-devices/get-started/unlock-bootloader";

    public SonyModule(DeviceInfo deviceInfo, UnlockLogger logger) {
        super(deviceInfo, logger);
    }

    @Override
    public String getUnlockMethodDescription() {
        return "Sony Xperia: OEM unlock code from developer.sony.com required";
    }

    @Override
    public boolean requiresTokenRetrieval() { return true; }

    @Override
    public String getUnlockPortalUrl() { return PORTAL_URL; }

    /** Returns device info string containing IMEI needed for Sony's portal. */
    public String getDeviceInfo(FastbootTransport fastboot) throws IOException {
        logger.info(TAG, "Fetching Sony device info (IMEI)…");
        String info = fastboot.command("oem deviceinfo");
        logger.success(TAG, "Device info: " + info);
        logger.warn(TAG, "Submit IMEI to " + PORTAL_URL + " to receive unlock code.");
        return info;
    }

    /** Applies the hex unlock code received from Sony's portal. */
    public void applyUnlockCode(FastbootTransport fastboot, String hexCode) throws IOException {
        String code = hexCode.startsWith("0x") ? hexCode : "0x" + hexCode;
        logger.info(TAG, "Applying Sony unlock code " + code + "…");
        fastboot.command("oem unlock " + code);
        logger.success(TAG, "Sony unlock code applied");
    }

    @Override
    public void performUnlock(FastbootTransport fastboot) throws IOException {
        logger.warn(TAG, "Sony devices require an OEM code. Trying standard path first…");
        try {
            fastboot.flashingUnlock();
        } catch (IOException e) {
            throw new IOException(
                    "Sony device requires OEM unlock code from " + PORTAL_URL
                            + ". Use getDeviceInfo() then applyUnlockCode().");
        }
    }
}
