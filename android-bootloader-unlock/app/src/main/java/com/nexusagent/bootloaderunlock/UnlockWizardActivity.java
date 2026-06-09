package com.nexusagent.bootloaderunlock;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.hardware.usb.UsbDevice;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.nexusagent.bootloaderunlock.device.DeviceInfo;
import com.nexusagent.bootloaderunlock.logging.LogEntry;
import com.nexusagent.bootloaderunlock.logging.UnlockLogger;
import com.nexusagent.bootloaderunlock.ui.LogAdapter;
import com.nexusagent.bootloaderunlock.unlock.UnlockCallback;
import com.nexusagent.bootloaderunlock.unlock.UnlockStep;
import com.nexusagent.bootloaderunlock.unlock.UnlockWizard;

public class UnlockWizardActivity extends Activity implements UnlockCallback {

    private static final String EXTRA_USB_DEVICE = "usb_device";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private UnlockLogger logger;
    private UnlockWizard wizard;
    private LogAdapter logAdapter;

    private TextView tvStepTitle;
    private TextView tvStepDescription;
    private TextView tvStepStatus;
    private ProgressBar progressStep;
    private TextView tvDeviceName;
    private TextView tvDeviceSerial;
    private TextView tvDeviceMode;
    private View cardDeviceInfo;
    private Button btnNext;
    private Button btnCancel;
    private LinearLayout layoutStepIndicators;
    private ListView rvLogs;

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

        setTitle("Unlock Wizard");

        tvStepTitle       = (TextView)    findViewById(R.id.tvStepTitle);
        tvStepDescription = (TextView)    findViewById(R.id.tvStepDescription);
        tvStepStatus      = (TextView)    findViewById(R.id.tvStepStatus);
        progressStep      = (ProgressBar) findViewById(R.id.progressStep);
        tvDeviceName      = (TextView)    findViewById(R.id.tvDeviceName);
        tvDeviceSerial    = (TextView)    findViewById(R.id.tvDeviceSerial);
        tvDeviceMode      = (TextView)    findViewById(R.id.tvDeviceMode);
        cardDeviceInfo    = findViewById(R.id.cardDeviceInfo);
        btnNext           = (Button)      findViewById(R.id.btnNext);
        btnCancel         = (Button)      findViewById(R.id.btnCancel);
        layoutStepIndicators = (LinearLayout) findViewById(R.id.layoutStepIndicators);

        rvLogs = (ListView) findViewById(R.id.rvLogs);
        logAdapter = new LogAdapter(this);
        rvLogs.setAdapter(logAdapter);

        logger = new UnlockLogger();
        logger.addListener(new UnlockLogger.LogListener() {
            @Override public void onLogAdded(LogEntry entry) {
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        logAdapter.addEntry(entry);
                        rvLogs.setSelection(logAdapter.getCount() - 1);
                    }
                });
            }
        });

        wizard = new UnlockWizard(this, logger, this);
        buildStepIndicators();

        btnNext.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { startWizard(); }
        });
        btnCancel.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (wizardRunning) wizard.cancel();
                finish();
            }
        });

        showStep(UnlockStep.CONNECT_DEVICE, false);
    }

    private void startWizard() {
        wizardRunning = true;
        btnNext.setEnabled(false);
        UsbDevice device = (UsbDevice) getIntent().getParcelableExtra(EXTRA_USB_DEVICE);
        wizard.start(device);
    }

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
            tvStepStatus.setText("OK " + step.label + " complete");
            tvStepStatus.setTextColor(getColor(R.color.colorSuccess));
        } else {
            tvStepStatus.setText("FAIL " + step.label + " failed");
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

    @Override public void onStepStarted(final UnlockStep step) {
        mainHandler.post(new Runnable() {
            @Override public void run() { showStep(step, true); }
        });
    }

    @Override public void onStepCompleted(final UnlockStep step) {
        mainHandler.post(new Runnable() {
            @Override public void run() { markStepDone(step, true); }
        });
    }

    @Override public void onStepFailed(final UnlockStep step, final String reason) {
        mainHandler.post(new Runnable() {
            @Override public void run() {
                markStepDone(step, false);
                btnNext.setEnabled(true);
                btnNext.setText(getString(R.string.btn_retry));
                wizardRunning = false;
            }
        });
    }

    @Override public void onDeviceDetected(final DeviceInfo info) {
        mainHandler.post(new Runnable() {
            @Override public void run() {
                cardDeviceInfo.setVisibility(View.VISIBLE);
                tvDeviceName.setText(info.displayName());
                tvDeviceSerial.setText("Serial: " + (info.serial.isEmpty() ? "unknown" : info.serial));
                tvDeviceMode.setText("Mode: " + info.mode.name());
            }
        });
    }

    @Override public void onAwaitingUserConfirmation(final String message) {
        mainHandler.post(new Runnable() {
            @Override public void run() {
                new AlertDialog.Builder(UnlockWizardActivity.this)
                        .setTitle("Confirm on Target Device")
                        .setMessage(message)
                        .setPositiveButton("OK", null)
                        .show();
            }
        });
    }

    @Override public void onUnlockSuccess() {
        mainHandler.post(new Runnable() {
            @Override public void run() {
                wizardRunning = false;
                new AlertDialog.Builder(UnlockWizardActivity.this)
                        .setTitle("Bootloader Unlocked!")
                        .setMessage("The bootloader has been successfully unlocked. The device will wipe and reboot.")
                        .setPositiveButton("Done", new DialogInterface.OnClickListener() {
                            @Override public void onClick(DialogInterface d, int w) { finish(); }
                        })
                        .setCancelable(false)
                        .show();
            }
        });
    }

    @Override public void onUnlockFailed(final String reason) {
        mainHandler.post(new Runnable() {
            @Override public void run() {
                wizardRunning = false;
                btnNext.setEnabled(true);
                btnNext.setText(getString(R.string.btn_retry));
                new AlertDialog.Builder(UnlockWizardActivity.this)
                        .setTitle("Unlock Failed")
                        .setMessage(reason)
                        .setPositiveButton("OK", null)
                        .show();
            }
        });
    }

    @Override public void onOemTokenRequired(final String oemName, final String portalUrl, final String deviceData) {
        mainHandler.post(new Runnable() {
            @Override public void run() {
                final EditText et = new EditText(UnlockWizardActivity.this);
                et.setHint("Paste unlock code here");

                new AlertDialog.Builder(UnlockWizardActivity.this)
                        .setTitle(oemName + " Unlock Code Required")
                        .setMessage("Unlock code from:\n" + portalUrl + "\n\nDevice data:\n" + deviceData)
                        .setView(et)
                        .setPositiveButton("Apply Code", new DialogInterface.OnClickListener() {
                            @Override public void onClick(DialogInterface d, int w) {
                                String code = et.getText().toString().trim();
                                if (!code.isEmpty()) wizard.applyOemUnlockCode(code);
                            }
                        })
                        .setNegativeButton("Cancel", null)
                        .show();
            }
        });
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }

    private String stepTitle(UnlockStep s) {
        switch (s) {
            case CONNECT_DEVICE:       return getString(R.string.step_1_title);
            case DETECT_AND_VERIFY:    return getString(R.string.step_2_title);
            case REBOOT_FASTBOOT:      return getString(R.string.step_3_title);
            case CHECK_UNLOCK_ABILITY: return getString(R.string.step_4_title);
            case EXECUTE_UNLOCK:       return getString(R.string.step_5_title);
            case COMPLETE:             return getString(R.string.step_6_title);
            default:                   return s.label;
        }
    }

    private String stepDesc(UnlockStep s) {
        switch (s) {
            case CONNECT_DEVICE:       return getString(R.string.step_1_desc);
            case DETECT_AND_VERIFY:    return getString(R.string.step_2_desc);
            case REBOOT_FASTBOOT:      return getString(R.string.step_3_desc);
            case CHECK_UNLOCK_ABILITY: return getString(R.string.step_4_desc);
            case EXECUTE_UNLOCK:       return getString(R.string.step_5_desc);
            case COMPLETE:             return getString(R.string.step_6_desc);
            default:                   return "";
        }
    }
}
