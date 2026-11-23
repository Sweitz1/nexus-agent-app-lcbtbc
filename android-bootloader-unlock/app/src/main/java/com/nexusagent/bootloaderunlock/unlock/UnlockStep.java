package com.nexusagent.bootloaderunlock.unlock;

/** Ordered steps of the bootloader unlock workflow. */
public enum UnlockStep {
    CONNECT_DEVICE(0, "Connect Device"),
    DETECT_AND_VERIFY(1, "Detect & Verify"),
    REBOOT_FASTBOOT(2, "Reboot to Fastboot"),
    CHECK_UNLOCK_ABILITY(3, "Check Unlock Ability"),
    EXECUTE_UNLOCK(4, "Execute Unlock"),
    COMPLETE(5, "Complete");

    public final int index;
    public final String label;

    UnlockStep(int index, String label) {
        this.index = index;
        this.label = label;
    }
}
