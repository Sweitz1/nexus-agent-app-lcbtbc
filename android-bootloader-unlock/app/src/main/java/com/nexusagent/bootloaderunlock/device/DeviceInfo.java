package com.nexusagent.bootloaderunlock.device;

import android.hardware.usb.UsbDevice;

public class DeviceInfo {

    public enum ConnectionMode { ADB, FASTBOOT, UNKNOWN }

    public final UsbDevice usbDevice;
    public final ConnectionMode mode;

    // Populated after ADB/Fastboot query
    public String manufacturer = "";
    public String model = "";
    public String serial = "";
    public String product = "";
    public String androidVersion = "";
    public String unlockAbility = "unknown";

    public DeviceInfo(UsbDevice usbDevice, ConnectionMode mode) {
        this.usbDevice = usbDevice;
        this.mode = mode;
        this.manufacturer = usbDevice.getManufacturerName() != null
                ? usbDevice.getManufacturerName() : "Unknown";
        this.model = usbDevice.getProductName() != null
                ? usbDevice.getProductName() : "Unknown";
    }

    public String displayName() {
        if (!manufacturer.isEmpty() && !model.isEmpty()
                && !manufacturer.equals("Unknown")) {
            return manufacturer + " " + model;
        }
        return model.isEmpty() ? "Android Device" : model;
    }

    public boolean canUnlock() {
        return "1".equals(unlockAbility);
    }

    @Override
    public String toString() {
        return "DeviceInfo{mode=" + mode + ", model=" + model
                + ", serial=" + serial + ", unlockAbility=" + unlockAbility + "}";
    }
}
