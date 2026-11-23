package com.nexusagent.bootloaderunlock.usb;

import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;

import com.nexusagent.bootloaderunlock.logging.UnlockLogger;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Implements a minimal subset of the ADB USB transport:
 *  - CONNECT / AUTH handshake (token, signature, public-key)
 *  - OPEN a service stream
 *  - WRITE / OKAY / CLSE stream management
 *
 * All I/O is synchronous and must be called from a background thread.
 */
public class AdbTransport {

    private static final String TAG = "AdbTransport";
    private static final int TIMEOUT_MS = 5000;

    private final UsbManager usbManager;
    private final AdbRsaKey rsaKey;
    private final UnlockLogger logger;

    private UsbDeviceConnection conn;
    private UsbEndpoint epIn;
    private UsbEndpoint epOut;

    private final AtomicInteger streamIdCounter = new AtomicInteger(1);

    public AdbTransport(UsbManager usbManager, AdbRsaKey rsaKey, UnlockLogger logger) {
        this.usbManager = usbManager;
        this.rsaKey     = rsaKey;
        this.logger     = logger;
    }

    // ----- Connection lifecycle -----

    /**
     * Opens USB connection to the device, locates the ADB interface, and performs
     * the CONNECT + AUTH handshake. Returns true on success.
     */
    public boolean connect(UsbDevice device) throws IOException {
        UsbInterface iface = findAdbInterface(device);
        if (iface == null) {
            throw new IOException("No ADB interface found on device");
        }

        conn = usbManager.openDevice(device);
        if (conn == null) {
            throw new IOException("Could not open USB device (permission denied?)");
        }

        if (!conn.claimInterface(iface, true)) {
            conn.close();
            throw new IOException("Could not claim ADB interface");
        }

        // Locate bulk-in and bulk-out endpoints
        for (int i = 0; i < iface.getEndpointCount(); i++) {
            UsbEndpoint ep = iface.getEndpoint(i);
            if (ep.getType() == android.hardware.usb.UsbConstants.USB_ENDPOINT_XFER_BULK) {
                if (ep.getDirection() == android.hardware.usb.UsbConstants.USB_DIR_IN) {
                    epIn = ep;
                } else {
                    epOut = ep;
                }
            }
        }
        if (epIn == null || epOut == null) {
            conn.close();
            throw new IOException("Could not find bulk endpoints");
        }

        logger.info(TAG, "USB connection established, starting ADB handshake");
        return performHandshake();
    }

    public void close() {
        if (conn != null) {
            conn.close();
            conn = null;
        }
        epIn = epOut = null;
    }

    // ----- High-level shell command -----

    /**
     * Opens a shell: service stream, sends the command, reads stdout until CLSE,
     * and returns the combined output.
     */
    public String shellCommand(String cmd) throws IOException {
        int localId  = streamIdCounter.getAndIncrement();
        int remoteId = 0;

        logger.info(TAG, "Sending: shell:" + cmd);
        send(AdbMessage.open(localId, "shell:" + cmd));

        // Wait for OKAY (remote assigns its ID)
        AdbMessage msg = readUntil(AdbMessage.A_OKAY, AdbMessage.A_CLSE, 10_000);
        if (msg.command == AdbMessage.A_CLSE) {
            throw new IOException("Stream closed before OKAY for: " + cmd);
        }
        remoteId = msg.arg0;
        send(AdbMessage.okay(localId, remoteId));

        // Collect WRTE payloads until CLSE
        StringBuilder sb = new StringBuilder();
        long deadline = System.currentTimeMillis() + 15_000;
        while (System.currentTimeMillis() < deadline) {
            AdbMessage m = readMessage(5_000);
            if (m == null) break;
            if (m.command == AdbMessage.A_WRTE) {
                sb.append(new String(m.payload));
                send(AdbMessage.okay(localId, remoteId));
            } else if (m.command == AdbMessage.A_CLSE) {
                break;
            }
        }

        send(AdbMessage.close(localId, remoteId));
        String result = sb.toString().trim();
        logger.info(TAG, "Result: " + result);
        return result;
    }

    // ----- Handshake -----

    private boolean performHandshake() throws IOException {
        send(AdbMessage.connect());

        AdbMessage reply = readMessage(TIMEOUT_MS);
        if (reply == null) throw new IOException("No reply to CONNECT");

        if (reply.command == AdbMessage.A_CNXN) {
            // Already connected (old ADB or "always allow" was set)
            String banner = new String(reply.payload);
            logger.success(TAG, "ADB connected: " + banner.replace("\0", ""));
            return true;
        }

        if (reply.command != AdbMessage.A_AUTH) {
            throw new IOException("Expected AUTH, got: " + reply);
        }

        // AUTH step 1: sign the token
        try {
            byte[] sig = rsaKey.signToken(reply.payload);
            send(AdbMessage.authSignature(sig));
        } catch (Exception e) {
            throw new IOException("RSA sign failed: " + e.getMessage());
        }

        AdbMessage authReply = readMessage(TIMEOUT_MS);
        if (authReply != null && authReply.command == AdbMessage.A_CNXN) {
            logger.success(TAG, "ADB auth via signature accepted");
            return true;
        }

        // AUTH step 2: send public key (user must accept on screen)
        logger.warn(TAG, "Signature rejected – sending public key. Accept on target device.");
        send(AdbMessage.authPublicKey(rsaKey.getAdbPublicKeyBytes()));

        AdbMessage finalReply = readMessage(30_000); // user has 30 s to accept
        if (finalReply != null && finalReply.command == AdbMessage.A_CNXN) {
            logger.success(TAG, "ADB auth via public key accepted");
            return true;
        }

        throw new IOException("ADB authentication failed – user did not accept key on target device");
    }

    // ----- USB I/O helpers -----

    private void send(AdbMessage msg) throws IOException {
        byte[] bytes = msg.toBytes();
        int sent = conn.bulkTransfer(epOut, bytes, bytes.length, TIMEOUT_MS);
        if (sent < 0) throw new IOException("USB write failed for " + msg);
    }

    private AdbMessage readMessage(int timeoutMs) throws IOException {
        byte[] hdr = new byte[AdbMessage.HEADER_SIZE];
        int n = conn.bulkTransfer(epIn, hdr, hdr.length, timeoutMs);
        if (n < AdbMessage.HEADER_SIZE) return null;

        AdbMessage proto = AdbMessage.fromHeader(hdr);
        if (proto.payload.length > 0) {
            byte[] payload = proto.payload; // already allocated by fromHeader
            int received = conn.bulkTransfer(epIn, payload, payload.length, timeoutMs);
            if (received < 0) throw new IOException("USB read payload failed");
            return new AdbMessage(proto.command, proto.arg0, proto.arg1, payload);
        }
        return proto;
    }

    private AdbMessage readUntil(int want1, int want2, int timeoutMs) throws IOException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            AdbMessage m = readMessage((int) Math.max(100, deadline - System.currentTimeMillis()));
            if (m == null) continue;
            if (m.command == want1 || m.command == want2) return m;
        }
        throw new IOException("Timed out waiting for message");
    }

    // ----- Interface detection -----

    private static UsbInterface findAdbInterface(UsbDevice device) {
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            // ADB: class=0xFF, subclass=0x42, protocol=0x01
            if (iface.getInterfaceClass()    == 0xFF
                    && iface.getInterfaceSubclass() == 0x42
                    && iface.getInterfaceProtocol() == 0x01) {
                return iface;
            }
        }
        return null;
    }

    public static boolean isAdbDevice(UsbDevice device) {
        return findAdbInterface(device) != null;
    }
}
