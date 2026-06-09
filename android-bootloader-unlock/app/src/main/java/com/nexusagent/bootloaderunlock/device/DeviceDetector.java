package com.nexusagent.bootloaderunlock.device;

import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;

import com.nexusagent.bootloaderunlock.usb.AdbTransport;
import com.nexusagent.bootloaderunlock.usb.FastbootTransport;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * Scans USB-attached devices and classifies them as ADB, Fastboot, or Unknown.
 */
public class DeviceDetector {

    private final UsbManager usbManager;

    public DeviceDetector(UsbManager usbManager) {
        this.usbManager = usbManager;
    }

    /** Returns all connected Android-like USB devices. */
    public List<DeviceInfo> detectDevices() {
        HashMap<String, UsbDevice> deviceMap = usbManager.getDeviceList();
        List<DeviceInfo> result = new ArrayList<>();

        for (UsbDevice usbDev : deviceMap.values()) {
            DeviceInfo.ConnectionMode mode = classifyDevice(usbDev);
            if (mode != DeviceInfo.ConnectionMode.UNKNOWN) {
                result.add(new DeviceInfo(usbDev, mode));
            }
        }
        return result;
    }

    public DeviceInfo.ConnectionMode classifyDevice(UsbDevice device) {
        if (FastbootTransport.isFastbootDevice(device)) return DeviceInfo.ConnectionMode.FASTBOOT;
        if (AdbTransport.isAdbDevice(device))           return DeviceInfo.ConnectionMode.ADB;
        // Broad fallback: vendor class 0xFF devices that look like Android
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            if (iface.getInterfaceClass() == 0xFF && iface.getInterfaceSubclass() == 0x42) {
                return DeviceInfo.ConnectionMode.ADB;
            }
        }
        return DeviceInfo.ConnectionMode.UNKNOWN;
    }

    public boolean hasPermission(UsbDevice device) {
        return usbManager.hasPermission(device);
    }

    public void requestPermission(UsbDevice device,
                                   android.app.PendingIntent pi) {
        usbManager.requestPermission(device, pi);
    }
}
