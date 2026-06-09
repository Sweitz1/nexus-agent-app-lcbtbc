package com.nexusagent.bootloaderunlock.oem;

import com.nexusagent.bootloaderunlock.device.DeviceInfo;
import com.nexusagent.bootloaderunlock.logging.UnlockLogger;
import com.nexusagent.bootloaderunlock.usb.FastbootTransport;

import java.io.IOException;

/**
 * Base class for manufacturer-specific unlock flows.
 * The default flow uses the standard 'fastboot flashing unlock' command.
 * Subclasses override {@link #requiresTokenRetrieval()} and
 * {@link #performUnlock(FastbootTransport)} for OEM-specific behaviour.
 */
public class OemModule {

    protected final UnlockLogger logger;
    protected final DeviceInfo deviceInfo;

    public OemModule(DeviceInfo deviceInfo, UnlockLogger logger) {
        this.deviceInfo = deviceInfo;
        this.logger     = logger;
    }

    /** Returns a human-readable description of the unlock method for this OEM. */
    public String getUnlockMethodDescription() {
        return "Standard fastboot flashing unlock";
    }

    /**
     * True if this OEM requires an unlock token/code from their servers before
     * issuing the fastboot unlock command (e.g. Motorola, Sony).
     */
    public boolean requiresTokenRetrieval() {
        return false;
    }

    /**
     * Returns a URL for the OEM's unlock portal, or null if not applicable.
     * The UI displays this URL so the user can retrieve their unlock code.
     */
    public String getUnlockPortalUrl() {
        return null;
    }

    /**
     * Performs the actual unlock sequence using the provided Fastboot transport.
     * The device must already be in Fastboot mode.
     */
    public void performUnlock(FastbootTransport fastboot) throws IOException {
        fastboot.flashingUnlock();
    }

    /** Factory: returns the right OemModule subclass for the given device. */
    public static OemModule forDevice(DeviceInfo info, UnlockLogger logger) {
        String mfr = (info.manufacturer + " " + info.model).toLowerCase();
        if (mfr.contains("motorola") || mfr.contains("moto")) {
            return new MotorolaModule(info, logger);
        }
        if (mfr.contains("xiaomi") || mfr.contains("redmi") || mfr.contains("poco")) {
            return new XiaomiModule(info, logger);
        }
        if (mfr.contains("sony") || mfr.contains("xperia")) {
            return new SonyModule(info, logger);
        }
        return new OemModule(info, logger);
    }
}
