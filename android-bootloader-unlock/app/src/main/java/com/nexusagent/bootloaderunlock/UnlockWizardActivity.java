package com.nexusagent.bootloaderunlock;

import android.app.AlertDialog;
import android.content.Intent;
import android.hardware.usb.UsbDevice;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.progressindicator.LinearProgressIndicator;
import com.nexusagent.bootloaderunlock.device.DeviceInfo;
import com.nexusagent.bootloaderunlock.logging.LogEntry;
import com.nexusagent.bootloaderunlock.logging.UnlockLogger;
import com.nexusagent.bootloaderunlock.ui.LogAdapter;
import com.nexusagent.bootloaderunlock.unlock.UnlockCallback;
import com.nexusagent.bootloaderunlock.unlock.UnlockStep;
import com.nexusagent.bootloaderunlock.unlock.UnlockWizard;

public class UnlockWizardActivity extends AppCompatActivity implements UnlockCallback {

    private static final String EXTRA_USB_DEVICE = "usb_device";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private UnlockLogger logger;
    private UnlockWizard wizard;
    private LogAdapter logAdapter;

    private TextView tvStepTitle;
    private TextView tvStepDescription;
    private TextView tvStepStatus;
    private LinearProgressIndicator progressStep;
    private TextView tvDeviceName;
    private TextView tvDeviceSerial;
    private TextView tvDeviceMode;
    private View cardDeviceInfo;
    private MaterialButton btnNext;
    private MaterialButton btnCancel;
    private LinearLayout layoutStepIndicators;

    private UnlockStep currentStep = UnlockStep.CONNECT_DEVICE;
    private boolean wizardRunning = false;

    public static Intent buildIntent(android.content.Context ctx, UsbDevice device) {
        Intent i = new Intent(ctx, UnlockWizardActivity.class);
        if (device != null) i.putExtra(EXTRA_USB_DEVICE, device);
        return i;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_unlock_wizard);

        // Toolbar
        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) getSupportActionBar().setDisplayHomeAsUpEnabled(true);
        toolbar.setNavigationOnClickListener(v -> onBackPressed());

        // Views
        tvStepTitle       = findViewById(R.id.tvStepTitle);
        tvStepDescription = findViewById(R.id.tvStepDescription);
        tvStepStatus      = findViewById(R.id.tvStepStatus);
        progressStep      = findViewById(R.id.progressStep);
        tvDeviceName      = findViewById(R.id.tvDeviceName);
        tvDeviceSerial    = findViewById(R.id.tvDeviceSerial);
        tvDeviceMode      = findViewById(R.id.tvDeviceMode);
        cardDeviceInfo    = findViewById(R.id.cardDeviceInfo);
        btnNext           = findViewById(R.id.btnNext);
        btnCancel         = findViewById(R.id.btnCancel);
        layoutStepIndicators = findViewById(R.id.layoutStepIndicators);

        // Log RecyclerView
        RecyclerView rvLogs = findViewById(R.id.rvLogs);
        logAdapter = new LogAdapter();
        rvLogs.setLayoutManager(new LinearLayoutManager(this));
        rvLogs.setAdapter(logAdapter);

        // Logger
        logger = new UnlockLogger();
        logger.addListener(entry -> runOnUiThread(() -> {
            logAdapter.addEntry(entry);
            rvLogs.scrollToPosition(logAdapter.getItemCount() - 1);
        }));

        // Wizard
        wizard = new UnlockWizard(this, logger, this);

        // Build step indicators
        buildStepIndicators();

        // Buttons
        btnNext.setOnClickListener(v -> startWizard());
        btnCancel.setOnClickListener(v -> {
            if (wizardRunning) {
                wizard.cancel();
            }
            finish();
        });

        showStep(UnlockStep.CONNECT_DEVICE, false);
    }

    private void startWizard() {
        wizardRunning = true;
        btnNext.setEnabled(false);
        UsbDevice device = getIntent().getParcelableExtra(EXTRA_USB_DEVICE);
        wizard.start(device);
    }

    // ----- Step UI -----

    private void showStep(UnlockStep step, boolean inProgress) {
        currentStep = step;
        tvStepTitle.setText(stepTitle(step));
        tvStepDescription.setText(stepDesc(step));
        progressStep.setVisibility(inProgress ? View.VISIBLE : View.GONE);
        tvStepStatus.setVisibility(View.GONE);
        highlightStepIndicator(step);
    }

    private void markStepDone(UnlockStep step, boolean success) {
        tvStepStatus.setVisibility(View.VISIBLE);
        if (success) {
            tvStepStatus.setText("✓ " + step.label + " complete");
            tvStepStatus.setTextColor(getColor(R.color.colorSuccess));
        } else {
            tvStepStatus.setText("✗ " + step.label + " failed");
            tvStepStatus.setTextColor(getColor(R.color.colorError));
        }
        progressStep.setVisibility(View.GONE);
        highlightStepIndicator(step);
    }

    private void buildStepIndicators() {
        layoutStepIndicators.removeAllViews();
        for (UnlockStep s : UnlockStep.values()) {
            View dot = new View(this);
            int size = dpToPx(10);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(size, size);
            lp.setMargins(dpToPx(4), 0, dpToPx(4), 0);
            dot.setLayoutParams(lp);
            dot.setBackground(getDrawable(R.drawable.bg_step_indicator));
            dot.setTag(s);
            layoutStepIndicators.addView(dot);

            if (s != UnlockStep.COMPLETE) {
                View line = new View(this);
                LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(0, dpToPx(2));
                llp.weight = 1;
                line.setLayoutParams(llp);
                line.setBackgroundColor(getColor(R.color.colorStepPending));
                layoutStepIndicators.addView(line);
            }
        }
    }

    private void highlightStepIndicator(UnlockStep active) {
        for (int i = 0; i < layoutStepIndicators.getChildCount(); i++) {
            View child = layoutStepIndicators.getChildAt(i);
            if (child.getTag() instanceof UnlockStep) {
                UnlockStep s = (UnlockStep) child.getTag();
                child.setActivated(s.index <= active.index);
            }
        }
    }

    // ----- UnlockCallback -----

    @Override public void onStepStarted(UnlockStep step) {
        mainHandler.post(() -> showStep(step, true));
    }

    @Override public void onStepCompleted(UnlockStep step) {
        mainHandler.post(() -> markStepDone(step, true));
    }

    @Override public void onStepFailed(UnlockStep step, String reason) {
        mainHandler.post(() -> {
            markStepDone(step, false);
            btnNext.setEnabled(true);
            btnNext.setText(getString(R.string.btn_retry));
            wizardRunning = false;
        });
    }

    @Override public void onDeviceDetected(DeviceInfo info) {
        mainHandler.post(() -> {
            cardDeviceInfo.setVisibility(View.VISIBLE);
            tvDeviceName.setText(info.displayName());
            tvDeviceSerial.setText("Serial: " + (info.serial.isEmpty() ? "unknown" : info.serial));
            tvDeviceMode.setText("Mode: " + info.mode.name());
        });
    }

    @Override public void onAwaitingUserConfirmation(String message) {
        mainHandler.post(() -> new AlertDialog.Builder(this)
                .setTitle("Confirm on Target Device")
                .setMessage(message)
                .setPositiveButton("OK", null)
                .show());
    }

    @Override public void onUnlockSuccess() {
        mainHandler.post(() -> {
            wizardRunning = false;
            new AlertDialog.Builder(this)
                    .setTitle("Bootloader Unlocked!")
                    .setMessage("The bootloader has been successfully unlocked. "
                            + "The device will wipe and reboot.")
                    .setPositiveButton("Done", (d, w) -> finish())
                    .setCancelable(false)
                    .show();
        });
    }

    @Override public void onUnlockFailed(String reason) {
        mainHandler.post(() -> {
            wizardRunning = false;
            btnNext.setEnabled(true);
            btnNext.setText(getString(R.string.btn_retry));
            new AlertDialog.Builder(this)
                    .setTitle("Unlock Failed")
                    .setMessage(reason)
                    .setPositiveButton("OK", null)
                    .show();
        });
    }

    @Override public void onOemTokenRequired(String oemName, String portalUrl, String deviceData) {
        mainHandler.post(() -> {
            View inputView = getLayoutInflater().inflate(android.R.layout.simple_list_item_1, null);
            EditText et = new EditText(this);
            et.setHint("Paste unlock code here");

            new AlertDialog.Builder(this)
                    .setTitle(oemName + " Unlock Code Required")
                    .setMessage("This device requires an unlock code from:\n" + portalUrl
                            + "\n\nDevice data:\n" + deviceData
                            + "\n\nPaste your unlock code below:")
                    .setView(et)
                    .setPositiveButton("Apply Code", (d, w) -> {
                        String code = et.getText().toString().trim();
                        if (!code.isEmpty()) wizard.applyOemUnlockCode(code);
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
        });
    }

    // ----- Helpers -----

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }

    private String stepTitle(UnlockStep s) {
        switch (s) {
            case CONNECT_DEVICE:      return getString(R.string.step_1_title);
            case DETECT_AND_VERIFY:   return getString(R.string.step_2_title);
            case REBOOT_FASTBOOT:     return getString(R.string.step_3_title);
            case CHECK_UNLOCK_ABILITY:return getString(R.string.step_4_title);
            case EXECUTE_UNLOCK:      return getString(R.string.step_5_title);
            case COMPLETE:            return getString(R.string.step_6_title);
            default:                  return s.label;
        }
    }

    private String stepDesc(UnlockStep s) {
        switch (s) {
            case CONNECT_DEVICE:      return getString(R.string.step_1_desc);
            case DETECT_AND_VERIFY:   return getString(R.string.step_2_desc);
            case REBOOT_FASTBOOT:     return getString(R.string.step_3_desc);
            case CHECK_UNLOCK_ABILITY:return getString(R.string.step_4_desc);
            case EXECUTE_UNLOCK:      return getString(R.string.step_5_desc);
            case COMPLETE:            return getString(R.string.step_6_desc);
            default:                  return "";
        }
    }
}
