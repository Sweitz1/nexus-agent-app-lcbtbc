package com.nexusagent.bootloaderunlock.usb;

import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;

import com.nexusagent.bootloaderunlock.logging.UnlockLogger;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Implements the Fastboot USB protocol.
 *
 * Wire format:
 *  - Commands: UTF-8 string, max 64 bytes, sent via bulk-out
 *  - Responses: one of four 4-byte status prefixes:
 *      "OKAY" – success; rest of packet is optional info
 *      "FAIL" – error; rest of packet is error message
 *      "DATA" – incoming data; next 8 hex chars = byte count
 *      "INFO" – informational; more responses will follow
 *
 * All I/O is synchronous; call from a background thread.
 */
public class FastbootTransport {

    private static final String TAG       = "FastbootTransport";
    private static final int    TIMEOUT   = 5_000;
    private static final int    MAX_CMD   = 64;
    private static final int    MAX_RESP  = 256;

    private final UsbManager usbManager;
    private final UnlockLogger logger;

    private UsbDeviceConnection conn;
    private UsbEndpoint epIn;
    private UsbEndpoint epOut;

    public FastbootTransport(UsbManager usbManager, UnlockLogger logger) {
        this.usbManager = usbManager;
        this.logger     = logger;
    }

    // ----- Connection lifecycle -----

    public void connect(UsbDevice device) throws IOException {
        UsbInterface iface = findFastbootInterface(device);
        if (iface == null) {
            throw new IOException("No Fastboot interface found");
        }

        conn = usbManager.openDevice(device);
        if (conn == null) {
            throw new IOException("Could not open USB device");
        }

        if (!conn.claimInterface(iface, true)) {
            conn.close();
            throw new IOException("Could not claim Fastboot interface");
        }

        for (int i = 0; i < iface.getEndpointCount(); i++) {
            UsbEndpoint ep = iface.getEndpoint(i);
            if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                if (ep.getDirection() == UsbConstants.USB_DIR_IN) epIn  = ep;
                else                                               epOut = ep;
            }
        }

        if (epIn == null || epOut == null) {
            conn.close();
            throw new IOException("Could not find Fastboot bulk endpoints");
        }

        logger.success(TAG, "Fastboot connection established");
    }

    public void close() {
        if (conn != null) { conn.close(); conn = null; }
        epIn = epOut = null;
    }

    // ----- High-level commands -----

    /** getvar:<name> → value string, or throws IOException on FAIL */
    public String getVar(String name) throws IOException {
        return command("getvar:" + name);
    }

    /** Returns true if the device reports unlock_ability=1 */
    public boolean checkUnlockAbility() throws IOException {
        try {
            String val = getVar("unlocked");
            if ("yes".equalsIgnoreCase(val.trim())) {
                logger.info(TAG, "Device is already unlocked");
                return true;
            }
        } catch (IOException ignored) {}

        String ability = getVar("unlock_ability");
        logger.info(TAG, "unlock_ability=" + ability);
        return "1".equals(ability.trim());
    }

    /** Sends 'fastboot flashing unlock' – user must confirm on target screen. */
    public void flashingUnlock() throws IOException {
        logger.warn(TAG, "Sending 'flashing unlock' – confirm on the target device screen");
        command("flashing unlock");
        logger.success(TAG, "Bootloader unlock command accepted");
    }

    /** Sends 'fastboot oem unlock' (older devices). */
    public void oemUnlock() throws IOException {
        logger.warn(TAG, "Sending 'oem unlock' – confirm on the target device screen");
        command("oem unlock");
        logger.success(TAG, "OEM unlock command accepted");
    }

    /** Sends 'fastboot reboot' to reboot back to normal OS. */
    public void reboot() throws IOException {
        sendCommand("reboot");
        // reboot commands don't always return a response
        logger.info(TAG, "Reboot command sent");
    }

    // ----- Protocol helpers -----

    /**
     * Sends a command and collects all INFO responses, then returns the OKAY payload
     * or throws IOException on FAIL.
     */
    public String command(String cmd) throws IOException {
        if (cmd.length() > MAX_CMD) {
            throw new IOException("Fastboot command too long: " + cmd);
        }
        sendCommand(cmd);
        return readResponse(30_000);
    }

    private void sendCommand(String cmd) throws IOException {
        byte[] bytes = cmd.getBytes(StandardCharsets.UTF_8);
        logger.info(TAG, "→ " + cmd);
        int sent = conn.bulkTransfer(epOut, bytes, bytes.length, TIMEOUT);
        if (sent < 0) throw new IOException("USB write failed");
    }

    /**
     * Reads responses until OKAY or FAIL, accumulating INFO messages.
     * Returns OKAY payload on success; throws on FAIL.
     */
    private String readResponse(int timeoutMs) throws IOException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            byte[] buf  = new byte[MAX_RESP];
            int    n    = conn.bulkTransfer(epIn, buf, buf.length, TIMEOUT);
            if (n < 4) {
                if (n < 0 && System.currentTimeMillis() < deadline) continue;
                throw new IOException("Short or failed USB read (n=" + n + ")");
            }
            String resp = new String(buf, 0, n, StandardCharsets.UTF_8);
            String status = resp.substring(0, 4);
            String data   = n > 4 ? resp.substring(4).trim() : "";

            switch (status) {
                case "OKAY":
                    logger.success(TAG, "← OKAY " + data);
                    return data;
                case "FAIL":
                    logger.error(TAG, "← FAIL " + data);
                    throw new IOException("Fastboot FAIL: " + data);
                case "INFO":
                    logger.info(TAG, "← INFO " + data);
                    break; // continue reading
                case "DATA":
                    // Ignore for simple getvar/unlock flows
                    logger.info(TAG, "← DATA " + data);
                    break;
                default:
                    logger.warn(TAG, "← ??? " + resp);
            }
        }
        throw new IOException("Timed out waiting for Fastboot response");
    }

    // ----- Interface detection -----

    private static UsbInterface findFastbootInterface(UsbDevice device) {
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            // Fastboot: class=0xFF, subclass=0x42, protocol=0x03
            if (iface.getInterfaceClass()    == 0xFF
                    && iface.getInterfaceSubclass() == 0x42
                    && iface.getInterfaceProtocol() == 0x03) {
                return iface;
            }
        }
        return null;
    }

    public static boolean isFastbootDevice(UsbDevice device) {
        return findFastbootInterface(device) != null;
    }
}
