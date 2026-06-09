package com.nexusagent.bootloaderunlock.usb;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;

/**
 * Manages the ADB RSA-2048 identity key pair and converts the public key into
 * Android's custom ADB wire format so the target device can display a fingerprint
 * and let the user approve it.
 *
 * ADB public-key struct (little-endian uint32 arrays, 2048-bit / RSANUMWORDS=64):
 *   int32  len      = RSANUMWORDS
 *   uint32 n0inv    = -n^(-1) mod 2^32
 *   uint32 n[64]    = modulus words (little-endian)
 *   uint32 rr[64]   = R^2 mod n words (little-endian), R = 2^2048
 *   int64  exponent = 65537
 */
public class AdbRsaKey {

    private static final String PREFS_NAME  = "nexus_adb_key";
    private static final String PREF_PRIV   = "private_key";
    private static final String PREF_PUB    = "public_key";
    private static final int    RSANUMWORDS = 64; // 64 * 32 = 2048 bits

    private final PrivateKey  privateKey;
    private final RSAPublicKey publicKey;
    private final byte[]      adbPublicKeyBytes; // ADB wire format + base64 + user@host

    public AdbRsaKey(PrivateKey privateKey, RSAPublicKey publicKey) throws Exception {
        this.privateKey = privateKey;
        this.publicKey  = publicKey;
        this.adbPublicKeyBytes = buildAdbPublicKey(publicKey);
    }

    public PrivateKey getPrivateKey()       { return privateKey; }
    public byte[]    getAdbPublicKeyBytes() { return adbPublicKeyBytes; }

    /** Sign a 20-byte ADB auth token with SHA1withRSA (PKCS#1 v1.5). */
    public byte[] signToken(byte[] token) throws Exception {
        java.security.Signature sig = java.security.Signature.getInstance("SHA1withRSA");
        sig.initSign(privateKey);
        sig.update(token);
        return sig.sign();
    }

    // ----- Key persistence -----

    public static AdbRsaKey load(Context ctx) throws Exception {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String privB64 = prefs.getString(PREF_PRIV, null);
        String pubB64  = prefs.getString(PREF_PUB,  null);

        if (privB64 == null || pubB64 == null) {
            return generate(ctx);
        }

        KeyFactory kf = KeyFactory.getInstance("RSA");
        PrivateKey   priv = kf.generatePrivate(new PKCS8EncodedKeySpec(Base64.decode(privB64, Base64.NO_WRAP)));
        RSAPublicKey pub  = (RSAPublicKey) kf.generatePublic(new X509EncodedKeySpec(Base64.decode(pubB64, Base64.NO_WRAP)));
        return new AdbRsaKey(priv, pub);
    }

    private static AdbRsaKey generate(Context ctx) throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        KeyPair kp = kpg.generateKeyPair();

        SharedPreferences.Editor ed = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit();
        ed.putString(PREF_PRIV, Base64.encodeToString(kp.getPrivate().getEncoded(), Base64.NO_WRAP));
        ed.putString(PREF_PUB,  Base64.encodeToString(kp.getPublic().getEncoded(),  Base64.NO_WRAP));
        ed.apply();

        return new AdbRsaKey(kp.getPrivate(), (RSAPublicKey) kp.getPublic());
    }

    // ----- ADB public key binary format -----

    /**
     * Converts an RSA public key into the binary struct expected by ADB, base64-encodes it,
     * and appends " nexusunlock@android\0" as the user@host identifier.
     */
    private static byte[] buildAdbPublicKey(RSAPublicKey pub) throws Exception {
        BigInteger modulus  = pub.getModulus();          // n
        BigInteger exponent = pub.getPublicExponent();   // e (65537)

        // n0inv = -n^(-1) mod 2^32
        BigInteger b32    = BigInteger.ONE.shiftLeft(32);
        BigInteger n0inv  = modulus.mod(b32).modInverse(b32).negate().mod(b32);

        // rr = R^2 mod n,  R = 2^2048
        BigInteger R  = BigInteger.ONE.shiftLeft(32 * RSANUMWORDS);
        BigInteger rr = R.multiply(R).mod(modulus);

        // Build struct
        int structSize = 4 + 4 + (4 * RSANUMWORDS) + (4 * RSANUMWORDS) + 8; // = 528 bytes
        ByteBuffer buf = ByteBuffer.allocate(structSize).order(ByteOrder.LITTLE_ENDIAN);

        buf.putInt(RSANUMWORDS);              // len
        buf.putInt((int) n0inv.longValue());  // n0inv

        // n[] – modulus as RSANUMWORDS little-endian 32-bit words
        byte[] nBytes = toUnsignedLittleEndianWords(modulus, RSANUMWORDS);
        buf.put(nBytes);

        // rr[] – same format
        byte[] rrBytes = toUnsignedLittleEndianWords(rr, RSANUMWORDS);
        buf.put(rrBytes);

        buf.putLong(exponent.longValue());    // exponent

        // base64-encode the struct, then append " user@host\0"
        String b64     = Base64.encodeToString(buf.array(), Base64.NO_WRAP);
        String keyStr  = b64 + " nexusunlock@android\0";
        return keyStr.getBytes("UTF-8");
    }

    /**
     * Returns the big integer as exactly {@code numWords} little-endian 32-bit words
     * (i.e. numWords*4 bytes), zero-padded or truncated as necessary.
     */
    private static byte[] toUnsignedLittleEndianWords(BigInteger val, int numWords) {
        byte[] result = new byte[numWords * 4];
        byte[] mag    = val.toByteArray(); // big-endian, may have leading 0x00 sign byte
        // strip leading zero byte if present
        int start = (mag.length > 0 && mag[0] == 0) ? 1 : 0;
        int srcLen = mag.length - start;
        // copy from end of mag (LSB) into result, byte-reversing for little-endian
        for (int i = 0; i < srcLen && i < result.length; i++) {
            result[i] = mag[mag.length - 1 - i];
        }
        return result;
    }
}
