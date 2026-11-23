package com.nexusagent.bootloaderunlock.unlock;

import com.nexusagent.bootloaderunlock.device.DeviceInfo;

/** Callbacks invoked from a background thread – post to main thread before touching UI. */
public interface UnlockCallback {
    void onStepStarted(UnlockStep step);
    void onStepCompleted(UnlockStep step);
    void onStepFailed(UnlockStep step, String reason);
    void onDeviceDetected(DeviceInfo info);
    /** Called when user confirmation is needed on the target device screen. */
    void onAwaitingUserConfirmation(String message);
    void onUnlockSuccess();
    void onUnlockFailed(String reason);
    /** Called when an OEM token retrieval URL needs to be shown to the user. */
    void onOemTokenRequired(String oemName, String portalUrl, String deviceData);
}
