package com.nexusagent.bootloaderunlock;

import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;
import com.nexusagent.bootloaderunlock.device.DeviceDetector;
import com.nexusagent.bootloaderunlock.device.DeviceInfo;

import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final String ACTION_USB_PERMISSION =
            "com.nexusagent.bootloaderunlock.USB_PERMISSION";

    private UsbManager usbManager;
    private DeviceDetector detector;

    private TextView tvDeviceStatus;
    private TextView tvDeviceDetails;
    private TextView tvDeviceMode;
    private View viewDeviceIndicator;
    private MaterialButton btnStartWizard;

    private UsbDevice pendingDevice;

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context ctx, Intent intent) {
            String action = intent.getAction();
            if (ACTION_USB_PERMISSION.equals(action)) {
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                boolean granted  = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                if (granted && device != null) {
                    launchWizard(device);
                } else {
                    showError(getString(R.string.error_permission_denied));
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (device != null) updateDeviceStatus(device);
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                showNoDevice();
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        usbManager = (UsbManager) getSystemService(USB_SERVICE);
        detector   = new DeviceDetector(usbManager);

        tvDeviceStatus  = findViewById(R.id.tvDeviceStatus);
        tvDeviceDetails = findViewById(R.id.tvDeviceDetails);
        tvDeviceMode    = findViewById(R.id.tvDeviceMode);
        viewDeviceIndicator = findViewById(R.id.viewDeviceIndicator);
        btnStartWizard  = findViewById(R.id.btnStartWizard);

        MaterialButton btnViewLogs = findViewById(R.id.btnViewLogs);
        btnViewLogs.setOnClickListener(v -> {
            // Logs are shown inside the wizard; re-launch with no device to view history
            startActivity(UnlockWizardActivity.buildIntent(this, null));
        });

        btnStartWizard.setOnClickListener(v -> {
            if (pendingDevice != null) {
                handleDevicePermission(pendingDevice);
            } else {
                // Check for already-connected devices
                List<DeviceInfo> devices = detector.detectDevices();
                if (!devices.isEmpty()) {
                    handleDevicePermission(devices.get(0).usbDevice);
                } else {
                    showDisclaimer();
                }
            }
        });

        // Register USB events
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(usbReceiver, filter, RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(usbReceiver, filter);
        }

        // Handle device attached via system intent
        handleIntent(getIntent());

        // Scan for already-connected devices
        refreshDeviceStatus();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshDeviceStatus();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        unregisterReceiver(usbReceiver);
    }

    // ----- Intent / USB handling -----

    private void handleIntent(Intent intent) {
        if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(intent.getAction())) {
            UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            if (device != null) updateDeviceStatus(device);
        }
    }

    private void refreshDeviceStatus() {
        List<DeviceInfo> devices = detector.detectDevices();
        if (!devices.isEmpty()) {
            updateDeviceStatus(devices.get(0).usbDevice);
        } else {
            showNoDevice();
        }
    }

    private void updateDeviceStatus(UsbDevice device) {
        DeviceInfo.ConnectionMode mode = detector.classifyDevice(device);
        if (mode == DeviceInfo.ConnectionMode.UNKNOWN) {
            showNoDevice();
            return;
        }

        pendingDevice = device;
        String name  = device.getProductName() != null ? device.getProductName() : "Android Device";
        String mfr   = device.getManufacturerName() != null ? device.getManufacturerName() : "";

        tvDeviceStatus.setText(getString(R.string.label_device_connected));
        tvDeviceStatus.setTextColor(getColor(R.color.colorSuccess));
        tvDeviceDetails.setVisibility(View.VISIBLE);
        tvDeviceDetails.setText(mfr.isEmpty() ? name : mfr + " " + name);
        tvDeviceMode.setVisibility(View.VISIBLE);
        tvDeviceMode.setText(mode == DeviceInfo.ConnectionMode.FASTBOOT
                ? "FASTBOOT" : "ADB");
        viewDeviceIndicator.setActivated(true);
    }

    private void showNoDevice() {
        pendingDevice = null;
        tvDeviceStatus.setText(getString(R.string.label_no_device));
        tvDeviceStatus.setTextColor(getColor(R.color.colorTextSecondary));
        tvDeviceDetails.setVisibility(View.GONE);
        tvDeviceMode.setVisibility(View.GONE);
        viewDeviceIndicator.setActivated(false);
    }

    private void handleDevicePermission(UsbDevice device) {
        if (detector.hasPermission(device)) {
            showDisclaimer(device);
        } else {
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? PendingIntent.FLAG_IMMUTABLE : 0;
            PendingIntent pi = PendingIntent.getBroadcast(this, 0,
                    new Intent(ACTION_USB_PERMISSION), flags);
            detector.requestPermission(device, pi);
        }
    }

    private void showDisclaimer() {
        showDisclaimer(null);
    }

    private void showDisclaimer(UsbDevice device) {
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.disclaimer_title))
                .setMessage(getString(R.string.disclaimer_body))
                .setPositiveButton(getString(R.string.btn_i_understand), (d, w) -> launchWizard(device))
                .setNegativeButton(getString(R.string.btn_cancel), null)
                .show();
    }

    private void launchWizard(UsbDevice device) {
        startActivity(UnlockWizardActivity.buildIntent(this, device));
    }

    private void showError(String message) {
        new AlertDialog.Builder(this)
                .setTitle("Error")
                .setMessage(message)
                .setPositiveButton("OK", null)
                .show();
    }
}
