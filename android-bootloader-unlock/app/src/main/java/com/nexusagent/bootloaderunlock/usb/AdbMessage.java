package com.nexusagent.bootloaderunlock.usb;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.zip.CRC32;

/**
 * ADB wire-format message (24-byte header + optional payload).
 * Spec: https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/master/protocol.txt
 */
public class AdbMessage {

    // Command identifiers
    public static final int A_SYNC = 0x434e5953;
    public static final int A_CNXN = 0x4e584e43;
    public static final int A_OPEN = 0x4e45504f;
    public static final int A_OKAY = 0x59414b4f;
    public static final int A_CLSE = 0x45534c43;
    public static final int A_WRTE = 0x45545257;
    public static final int A_AUTH = 0x48545541;

    // AUTH subtypes
    public static final int AUTH_TOKEN = 1;
    public static final int AUTH_SIGNATURE = 2;
    public static final int AUTH_RSAPUBLICKEY = 3;

    public static final int VERSION = 0x01000000;
    public static final int MAX_PAYLOAD = 256 * 1024;

    public static final int HEADER_SIZE = 24;

    public final int command;
    public final int arg0;
    public final int arg1;
    public final byte[] payload;

    public AdbMessage(int command, int arg0, int arg1, byte[] payload) {
        this.command = command;
        this.arg0 = arg0;
        this.arg1 = arg1;
        this.payload = payload != null ? payload : new byte[0];
    }

    /** Serialise header + payload into a single byte array ready for USB bulk-out. */
    public byte[] toBytes() {
        int dataLen = payload.length;
        int dataCrc = crc32(payload);
        ByteBuffer buf = ByteBuffer.allocate(HEADER_SIZE + dataLen)
                .order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(command);
        buf.putInt(arg0);
        buf.putInt(arg1);
        buf.putInt(dataLen);
        buf.putInt(dataCrc);
        buf.putInt(command ^ 0xFFFFFFFF);
        if (dataLen > 0) buf.put(payload);
        return buf.array();
    }

    /** Parse a 24-byte header from a USB bulk-in transfer. */
    public static AdbMessage fromHeader(byte[] header) {
        ByteBuffer buf = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
        int cmd  = buf.getInt();
        int a0   = buf.getInt();
        int a1   = buf.getInt();
        int dlen = buf.getInt();
        // skip crc and magic
        return new AdbMessage(cmd, a0, a1, new byte[dlen]);
    }

    private static int crc32(byte[] data) {
        if (data.length == 0) return 0;
        CRC32 crc = new CRC32();
        crc.update(data);
        return (int) crc.getValue();
    }

    // --- Factories ---

    public static AdbMessage connect() {
        String banner = "host::NexusBootloaderUnlock\0";
        return new AdbMessage(A_CNXN, VERSION, MAX_PAYLOAD, banner.getBytes());
    }

    public static AdbMessage authSignature(byte[] signedToken) {
        return new AdbMessage(A_AUTH, AUTH_SIGNATURE, 0, signedToken);
    }

    public static AdbMessage authPublicKey(byte[] publicKeyBytes) {
        // ADB public key must be null-terminated
        byte[] data = new byte[publicKeyBytes.length + 1];
        System.arraycopy(publicKeyBytes, 0, data, 0, publicKeyBytes.length);
        data[publicKeyBytes.length] = 0;
        return new AdbMessage(A_AUTH, AUTH_RSAPUBLICKEY, 0, data);
    }

    public static AdbMessage open(int localId, String service) {
        return new AdbMessage(A_OPEN, localId, 0, (service + "\0").getBytes());
    }

    public static AdbMessage okay(int localId, int remoteId) {
        return new AdbMessage(A_OKAY, localId, remoteId, null);
    }

    public static AdbMessage write(int localId, int remoteId, byte[] data) {
        return new AdbMessage(A_WRTE, localId, remoteId, data);
    }

    public static AdbMessage close(int localId, int remoteId) {
        return new AdbMessage(A_CLSE, localId, remoteId, null);
    }

    @Override
    public String toString() {
        String cmdName = commandName(command);
        return "AdbMessage{" + cmdName + " arg0=" + arg0 + " arg1=" + arg1
                + " payload=" + payload.length + "b}";
    }

    private static String commandName(int cmd) {
        switch (cmd) {
            case A_CNXN: return "CNXN";
            case A_AUTH: return "AUTH";
            case A_OPEN: return "OPEN";
            case A_OKAY: return "OKAY";
            case A_CLSE: return "CLSE";
            case A_WRTE: return "WRTE";
            case A_SYNC: return "SYNC";
            default:     return "0x" + Integer.toHexString(cmd);
        }
    }
}
