package com.nexus.agent;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Bluetooth for agents: adapter state, paired devices with what's connected (audio, headset, car),
 * scanning for nearby devices, pairing, and the current audio output (media follows the connected
 * Bluetooth speaker / headphones / car automatically).
 *
 * Android does not let ordinary apps connect/disconnect audio profiles or unpair devices; for those
 * the system Bluetooth settings or the media output switcher are opened instead.
 */
@SuppressLint("MissingPermission")   // callers check BLUETOOTH_CONNECT / BLUETOOTH_SCAN first (JS ensurePermission)
final class BluetoothTools {
    private final Context ctx;
    private final Set<String> connected = new HashSet<>();   // addresses connected on A2DP/headset/LE audio

    private boolean proxiesAsked;

    BluetoothTools(Context c) {
        ctx = c.getApplicationContext();
        IntentFilter f = new IntentFilter();
        f.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        f.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        try {
            ctx.registerReceiver(new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent i) {
                    BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    if (d == null) return;
                    synchronized (connected) {
                        if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(i.getAction())) connected.add(d.getAddress());
                        else connected.remove(d.getAddress());
                    }
                }
            }, f);
        } catch (Exception ignored) { }
    }

    /** Reads which paired devices are connected on the audio profiles (needs BLUETOOTH_CONNECT; retried until it works). */
    private void refreshProxies() {
        BluetoothAdapter a = adapter();
        if (a == null || proxiesAsked) return;
        for (int profile : new int[]{BluetoothProfile.A2DP, BluetoothProfile.HEADSET}) {
            try {
                a.getProfileProxy(ctx, new BluetoothProfile.ServiceListener() {
                    @Override public void onServiceConnected(int p, BluetoothProfile proxy) {
                        try { for (BluetoothDevice d : proxy.getConnectedDevices()) synchronized (connected) { connected.add(d.getAddress()); } } catch (Exception ignored) { }
                        try { a.closeProfileProxy(p, proxy); } catch (Exception ignored) { }
                    }
                    @Override public void onServiceDisconnected(int p) { }
                }, profile);
                proxiesAsked = true;
            } catch (Exception ignored) { }
        }
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    static String kind(BluetoothDevice d) {
        try {
            BluetoothClass c = d.getBluetoothClass();
            if (c == null) return "device";
            int major = c.getMajorDeviceClass(), dev = c.getDeviceClass();
            if (dev == BluetoothClass.Device.AUDIO_VIDEO_CAR_AUDIO || dev == BluetoothClass.Device.AUDIO_VIDEO_HANDSFREE) return "car / hands-free";
            if (dev == BluetoothClass.Device.AUDIO_VIDEO_WEARABLE_HEADSET || dev == BluetoothClass.Device.AUDIO_VIDEO_HEADPHONES) return "headphones";
            if (dev == BluetoothClass.Device.AUDIO_VIDEO_LOUDSPEAKER || dev == BluetoothClass.Device.AUDIO_VIDEO_PORTABLE_AUDIO || dev == BluetoothClass.Device.AUDIO_VIDEO_HIFI_AUDIO) return "speaker";
            if (dev == BluetoothClass.Device.AUDIO_VIDEO_VIDEO_DISPLAY_AND_LOUDSPEAKER || dev == BluetoothClass.Device.AUDIO_VIDEO_VIDEO_MONITOR) return "tv / display";
            switch (major) {
                case BluetoothClass.Device.Major.AUDIO_VIDEO: return "audio";
                case BluetoothClass.Device.Major.PHONE: return "phone";
                case BluetoothClass.Device.Major.COMPUTER: return "computer";
                case BluetoothClass.Device.Major.WEARABLE: return "wearable";
                case BluetoothClass.Device.Major.PERIPHERAL: return "keyboard / mouse / controller";
                case BluetoothClass.Device.Major.HEALTH: return "health";
                default: return "device";
            }
        } catch (Exception e) { return "device"; }
    }

    private JSONObject dev(BluetoothDevice d) throws Exception {
        JSONObject o = new JSONObject();
        String n = null; try { n = d.getName(); } catch (Exception ignored) { }
        o.put("name", n == null ? d.getAddress() : n);
        o.put("address", d.getAddress());
        o.put("kind", kind(d));
        o.put("paired", d.getBondState() == BluetoothDevice.BOND_BONDED);
        synchronized (connected) { o.put("connected", connected.contains(d.getAddress())); }
        return o;
    }

    String state() throws Exception {
        BluetoothAdapter a = adapter();
        JSONObject o = new JSONObject();
        o.put("available", a != null);
        if (a == null) return o.toString();
        o.put("enabled", a.isEnabled());
        refreshProxies();
        try { o.put("name", a.getName()); } catch (Exception ignored) { }
        o.put("audioOutput", new JSONObject(audioOutput()));
        return o.toString();
    }

    String paired() throws Exception {
        BluetoothAdapter a = adapter();
        JSONArray arr = new JSONArray();
        if (a == null || !a.isEnabled()) return arr.toString();
        refreshProxies();
        for (BluetoothDevice d : a.getBondedDevices()) arr.put(dev(d));
        return arr.toString();
    }

    /** Discovers nearby devices for up to timeoutMs (discoverable phones, speakers in pairing mode, cars…). */
    String scan(int timeoutMs) throws Exception {
        BluetoothAdapter a = adapter();
        if (a == null) throw new Exception("No Bluetooth on this device");
        if (!a.isEnabled()) throw new Exception("Bluetooth is off — turn it on first");
        final Map<String, JSONObject> found = new LinkedHashMap<>();
        final CountDownLatch done = new CountDownLatch(1);
        BroadcastReceiver r = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(i.getAction())) { done.countDown(); return; }
                BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (d == null) return;
                try {
                    JSONObject o = dev(d);
                    o.put("rssi", i.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE));
                    synchronized (found) { found.put(d.getAddress(), o); }
                } catch (Exception ignored) { }
            }
        };
        IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_FOUND);
        f.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        ctx.registerReceiver(r, f);
        try {
            if (a.isDiscovering()) a.cancelDiscovery();
            if (!a.startDiscovery()) throw new Exception("Could not start scanning (permission or location off?)");
            done.await(Math.max(3000, Math.min(timeoutMs, 30000)), TimeUnit.MILLISECONDS);
        } finally {
            try { a.cancelDiscovery(); } catch (Exception ignored) { }
            try { ctx.unregisterReceiver(r); } catch (Exception ignored) { }
        }
        JSONArray arr = new JSONArray();
        synchronized (found) { for (JSONObject o : found.values()) arr.put(o); }
        return arr.toString();
    }

    /** Starts pairing; Android shows its own confirmation (PIN / passkey) dialog. Waits up to 60 s. */
    String pair(String address) throws Exception {
        BluetoothAdapter a = adapter();
        if (a == null || !a.isEnabled()) throw new Exception("Bluetooth is off — turn it on first");
        if (!BluetoothAdapter.checkBluetoothAddress(address)) throw new Exception("Not a Bluetooth address: " + address);
        BluetoothDevice d = a.getRemoteDevice(address);
        if (d.getBondState() == BluetoothDevice.BOND_BONDED) return "Already paired with " + dev(d).optString("name");
        final CountDownLatch done = new CountDownLatch(1);
        final int[] result = {BluetoothDevice.BOND_NONE};
        BroadcastReceiver r = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                BluetoothDevice x = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (x == null || !x.getAddress().equals(address)) return;
                int st = i.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE);
                if (st != BluetoothDevice.BOND_BONDING) { result[0] = st; done.countDown(); }
            }
        };
        ctx.registerReceiver(r, new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED));
        try {
            if (a.isDiscovering()) a.cancelDiscovery();
            if (!d.createBond()) throw new Exception("Pairing could not start");
            done.await(60, TimeUnit.SECONDS);
        } finally { try { ctx.unregisterReceiver(r); } catch (Exception ignored) { } }
        String name = dev(d).optString("name");
        if (result[0] == BluetoothDevice.BOND_BONDED) return "Paired with " + name + ". Audio devices usually connect automatically; if not, connect it in Bluetooth settings.";
        return "Pairing with " + name + " did not complete (cancelled, wrong PIN or timed out).";
    }

    /** Where media audio is going right now (speaker, wired, Bluetooth device name, USB, HDMI…). */
    String audioOutput() throws Exception {
        AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        JSONObject o = new JSONObject();
        JSONArray outs = new JSONArray();
        String active = "phone speaker";
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            String t;
            switch (d.getType()) {
                case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP: t = "bluetooth"; break;
                case AudioDeviceInfo.TYPE_BLUETOOTH_SCO: t = "bluetooth-call"; break;
                case AudioDeviceInfo.TYPE_WIRED_HEADPHONES: case AudioDeviceInfo.TYPE_WIRED_HEADSET: t = "wired"; break;
                case AudioDeviceInfo.TYPE_USB_DEVICE: case AudioDeviceInfo.TYPE_USB_HEADSET: t = "usb"; break;
                case AudioDeviceInfo.TYPE_HDMI: t = "hdmi"; break;
                case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: t = "speaker"; break;
                default:
                    if (Build.VERSION.SDK_INT >= 31 && (d.getType() == AudioDeviceInfo.TYPE_BLE_HEADSET || d.getType() == AudioDeviceInfo.TYPE_BLE_SPEAKER)) t = "bluetooth-le";
                    else continue;
            }
            JSONObject x = new JSONObject();
            x.put("type", t);
            x.put("name", String.valueOf(d.getProductName()));
            outs.put(x);
            if (t.startsWith("bluetooth") && !t.equals("bluetooth-call")) active = "Bluetooth: " + d.getProductName();
            else if ((t.equals("wired") || t.equals("usb")) && !active.startsWith("Bluetooth")) active = t + ": " + d.getProductName();
        }
        o.put("active", active);
        o.put("outputs", outs);
        o.put("bluetoothA2dpOn", am.isBluetoothA2dpOn());
        return o.toString();
    }

    /** Android 11+ media output switcher (pick phone / Bluetooth / cast device for this app's audio). */
    boolean openOutputSwitcher() {
        try {
            Intent i = new Intent("com.android.systemui.action.LAUNCH_MEDIA_OUTPUT_DIALOG");
            i.setPackage("com.android.systemui");
            i.putExtra("package_name", ctx.getPackageName());
            ctx.sendBroadcast(i);
            return true;
        } catch (Exception e) { return false; }
    }

    static List<String> requiredPermissions() {
        return Build.VERSION.SDK_INT >= 31
                ? java.util.Arrays.asList("android.permission.BLUETOOTH_CONNECT", "android.permission.BLUETOOTH_SCAN")
                : java.util.Collections.singletonList("android.permission.ACCESS_FINE_LOCATION");
    }
}
