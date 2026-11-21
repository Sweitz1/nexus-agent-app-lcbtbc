package com.halo.agent;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Bluetooth on the glasses: list paired devices, scan for new ones, pair and unpair.
 * Pairing shows the system confirmation dialog. Needs BLUETOOTH_SCAN / BLUETOOTH_CONNECT on
 * Android 12+ (requested from JS before calling).
 */
@SuppressLint("MissingPermission")
class BluetoothTools {

    interface Result { void done(boolean ok, String json); }

    private final Context ctx;
    private final Handler main = new Handler(Looper.getMainLooper());

    BluetoothTools(Context ctx) { this.ctx = ctx; }

    private BluetoothAdapter adapter() {
        BluetoothManager bm = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
        return bm == null ? null : bm.getAdapter();
    }

    static boolean needsRuntimePermissions() { return Build.VERSION.SDK_INT >= 31; }

    private static String kind(BluetoothDevice d) {
        BluetoothClass c = d.getBluetoothClass();
        if (c == null) return "device";
        switch (c.getMajorDeviceClass()) {
            case BluetoothClass.Device.Major.AUDIO_VIDEO: return "audio";
            case BluetoothClass.Device.Major.PHONE: return "phone";
            case BluetoothClass.Device.Major.COMPUTER: return "computer";
            case BluetoothClass.Device.Major.PERIPHERAL: return "keyboard/mouse/controller";
            case BluetoothClass.Device.Major.WEARABLE: return "wearable";
            case BluetoothClass.Device.Major.HEALTH: return "health";
            case BluetoothClass.Device.Major.TOY: return "toy";
            case BluetoothClass.Device.Major.IMAGING: return "imaging";
            default: return "device";
        }
    }

    private static JSONObject describe(BluetoothDevice d, Integer rssi) throws Exception {
        JSONObject o = new JSONObject();
        String name = d.getName();
        o.put("name", name == null || name.isEmpty() ? "(unnamed)" : name);
        o.put("address", d.getAddress());
        o.put("kind", kind(d));
        o.put("paired", d.getBondState() == BluetoothDevice.BOND_BONDED);
        try { o.put("connected", (boolean) d.getClass().getMethod("isConnected").invoke(d)); } catch (Exception ignored) { }
        if (rssi != null) o.put("rssi", rssi);
        return o;
    }

    String status() {
        try {
            BluetoothAdapter a = adapter();
            JSONObject o = new JSONObject();
            if (a == null) { o.put("available", false); return o.toString(); }
            o.put("available", true);
            o.put("on", a.isEnabled());
            o.put("name", a.getName());
            JSONArray arr = new JSONArray();
            if (a.isEnabled()) for (BluetoothDevice d : a.getBondedDevices()) arr.put(describe(d, null));
            o.put("paired", arr);
            return o.toString();
        } catch (SecurityException e) {
            return "{\"error\":\"Bluetooth permission is off\"}";
        } catch (Exception e) {
            return NativeBridge.errorJson(e);
        }
    }

    void scan(long timeoutMs, Result r) {
        BluetoothAdapter a = adapter();
        if (a == null) { r.done(false, "{\"error\":\"No Bluetooth on this device\"}"); return; }
        if (!a.isEnabled()) { r.done(false, "{\"error\":\"Bluetooth is off\"}"); return; }
        final Map<String, JSONObject> found = new LinkedHashMap<>();
        final boolean[] done = {false};
        BroadcastReceiver rx = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                if (!BluetoothDevice.ACTION_FOUND.equals(i.getAction())) return;
                BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (d == null) return;
                short rssi = i.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE);
                try { found.put(d.getAddress(), describe(d, rssi == Short.MIN_VALUE ? null : (int) rssi)); } catch (Exception ignored) { }
            }
        };
        try {
            register(rx, new IntentFilter(BluetoothDevice.ACTION_FOUND));
            if (a.isDiscovering()) a.cancelDiscovery();
            if (!a.startDiscovery()) { unregister(rx); r.done(false, "{\"error\":\"Could not start scanning\"}"); return; }
        } catch (SecurityException e) { unregister(rx); r.done(false, "{\"error\":\"Bluetooth permission is off\"}"); return; }
        main.postDelayed(() -> {
            if (done[0]) return; done[0] = true;
            try { a.cancelDiscovery(); } catch (Exception ignored) { }
            unregister(rx);
            JSONArray arr = new JSONArray();
            for (JSONObject o : found.values()) arr.put(o);
            r.done(true, "{\"devices\":" + arr + "}");
        }, Math.max(3000, Math.min(timeoutMs, 30000)));
    }

    void pair(String address, Result r) {
        BluetoothAdapter a = adapter();
        if (a == null || !BluetoothAdapter.checkBluetoothAddress(address)) { r.done(false, "{\"error\":\"Bad device address\"}"); return; }
        try {
            BluetoothDevice d = a.getRemoteDevice(address);
            if (d.getBondState() == BluetoothDevice.BOND_BONDED) { r.done(true, "{\"state\":\"paired\"}"); return; }
            try { a.cancelDiscovery(); } catch (Exception ignored) { }
            final boolean[] done = {false};
            BroadcastReceiver rx = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent i) {
                    BluetoothDevice dv = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    if (dv == null || !address.equalsIgnoreCase(dv.getAddress()) || done[0]) return;
                    int s = i.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR);
                    if (s == BluetoothDevice.BOND_BONDED || s == BluetoothDevice.BOND_NONE) {
                        done[0] = true; unregister(this);
                        r.done(s == BluetoothDevice.BOND_BONDED, s == BluetoothDevice.BOND_BONDED ? "{\"state\":\"paired\"}" : "{\"error\":\"Pairing was declined or failed\"}");
                    }
                }
            };
            register(rx, new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED));
            if (!d.createBond()) { done[0] = true; unregister(rx); r.done(false, "{\"error\":\"Could not start pairing\"}"); return; }
            main.postDelayed(() -> { if (!done[0]) { done[0] = true; unregister(rx); r.done(false, "{\"error\":\"Pairing timed out\"}"); } }, 45000);
        } catch (SecurityException e) {
            r.done(false, "{\"error\":\"Bluetooth permission is off\"}");
        }
    }

    String unpair(String address) {
        try {
            BluetoothAdapter a = adapter();
            if (a == null || !BluetoothAdapter.checkBluetoothAddress(address)) return "{\"error\":\"Bad device address\"}";
            BluetoothDevice d = a.getRemoteDevice(address);
            boolean ok = (boolean) d.getClass().getMethod("removeBond").invoke(d);
            return ok ? "{\"state\":\"unpaired\"}" : "{\"error\":\"Could not unpair; use Bluetooth settings\"}";
        } catch (SecurityException e) {
            return "{\"error\":\"Bluetooth permission is off\"}";
        } catch (Exception e) {
            return "{\"error\":\"Unpairing isn't available here; use Bluetooth settings\"}";
        }
    }

    private void register(BroadcastReceiver rx, IntentFilter f) {
        if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(rx, f, Context.RECEIVER_EXPORTED);
        else ctx.registerReceiver(rx, f);
    }

    private void unregister(BroadcastReceiver rx) { try { ctx.unregisterReceiver(rx); } catch (Exception ignored) { } }
}
