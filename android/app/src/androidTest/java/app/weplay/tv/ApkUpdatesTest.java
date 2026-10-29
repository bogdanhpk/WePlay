package app.weplay.tv;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import static org.junit.Assert.*;

/** Native integration tests: real PackageManager certificates and a signed newer APK fixture. */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class ApkUpdatesTest {
    private Context context;
    private ApkUpdates manager;
    private byte[] good, otherSigner;
    private String certificate;
    private long current;
    private long targetCode;
    private String targetVersion;
    private static final String GUARD = "local-data-must-survive-updates";

    @Before public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File folder = new File(context.getFilesDir(), "updates");
        if (folder.exists()) for (File file : folder.listFiles()) file.delete();
        Context test = InstrumentationRegistry.getInstrumentation().getContext();
        try (InputStream input = test.getAssets().open("update-good.apk")) { good = ApkUpdates.read(input, 10 * 1024 * 1024); }
        try (InputStream input = test.getAssets().open("update-other-signer.apk")) { otherSigner = ApkUpdates.read(input, 10 * 1024 * 1024); }
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        certificate = ApkUpdates.certificate(context.getPackageManager().getPackageInfo(context.getPackageName(), flags));
        current = ApkUpdates.versionCode(context.getPackageManager().getPackageInfo(context.getPackageName(), 0));
        File fixture = new File(context.getCacheDir(), "update-fixture.apk");
        try (FileOutputStream output = new FileOutputStream(fixture)) { output.write(good); }
        android.content.pm.PackageInfo archive = context.getPackageManager().getPackageArchiveInfo(fixture.getPath(), 0);
        assertNotNull(archive); targetCode = ApkUpdates.versionCode(archive); targetVersion = archive.versionName; fixture.delete();
        assertTrue(targetCode > current);
        context.getSharedPreferences("update-test-history", 0).edit().putString("guard", GUARD).commit();
    }
    @After public void cleanup() {
        if (manager != null) manager.close();
        assertEquals(GUARD, context.getSharedPreferences("update-test-history", 0).getString("guard", ""));
    }
    private JSONObject manifest(byte[] bytes) throws Exception {
        JSONObject apk = new JSONObject().put("url", "https://raw.githubusercontent.com/bogdanhpk/WePlay/main/downloads/WePlay-AndroidTV-1.0.2.apk")
            .put("size", bytes.length).put("sha256", ApkUpdates.hex(MessageDigest.getInstance("SHA-256").digest(bytes))).put("certificateSha256", certificate);
        return new JSONObject().put("schema", 1).put("platform", "android-tv").put("packageName", context.getPackageName())
            .put("versionCode", targetCode).put("versionName", targetVersion).put("minSdk", 26).put("apk", apk);
    }
    private ApkUpdates.Source source(JSONObject descriptor, byte[] bytes) {
        return address -> new ByteArrayInputStream(address.contains("stable.json") ? descriptor.toString().getBytes(StandardCharsets.UTF_8) : bytes);
    }
    private void manager(ApkUpdates.Source source) throws Exception {
        manager = new ApkUpdates(context, new ApkUpdates.Listener() {
            public void state(JSONObject state) { }
            public void install(File file) { }
        }, source, "https://raw.githubusercontent.com/bogdanhpk/WePlay/main/updates/android/stable.json");
    }
    private interface Condition { boolean done() throws Exception; }
    private void until(Condition condition) throws Exception {
        long deadline = System.currentTimeMillis() + 20000;
        while (System.currentTimeMillis() < deadline) { if (condition.done()) return; Thread.sleep(30); }
        fail("Update state timed out: " + manager.snapshot());
    }
    private void available() throws Exception { manager.check(true); until(() -> !manager.snapshot().getBoolean("checking")); assertTrue(manager.snapshot().getBoolean("available")); }
    private void download() throws Exception { manager.download(); until(() -> !manager.snapshot().getString("phase").equals("downloading")); }
    private void rejected(JSONObject descriptor) throws Exception {
        try { ApkUpdate.parse(descriptor, context.getPackageName(), Build.VERSION.SDK_INT, certificate); fail("Invalid descriptor accepted"); }
        catch (IOException expected) { }
    }

    @Test public void aDescriptorRejectsWrongPlatformIdentityHostAndFields() throws Exception {
        rejected(manifest(good).put("platform", "tizen"));
        rejected(manifest(good).put("packageName", "other.application"));
        rejected(manifest(good).put("versionCode", 3.5));
        rejected(manifest(good).put("minSdk", 999));
        JSONObject address = manifest(good); address.getJSONObject("apk").put("url", "https://127.0.0.1/update.apk"); rejected(address);
        address = manifest(good); address.getJSONObject("apk").put("url", "https://raw.githubusercontent.com/other/repo/main/update.apk"); rejected(address);
        address = manifest(good); address.getJSONObject("apk").put("url", "https://raw.githubusercontent.com/bogdanhpk/WePlay/main/downloads/../update.apk"); rejected(address);
        address = manifest(good); address.getJSONObject("apk").put("size", ApkUpdate.MAX_BYTES + 1); rejected(address);
        address = manifest(good); address.getJSONObject("apk").put("certificateSha256", new String(new char[64]).replace('\0', '0')); rejected(address);
        address = manifest(good); address.getJSONObject("apk").put("sha256", "no-checksum"); rejected(address);
    }
    @Test public void bInstalledOrOlderCodeDoesNotOfferUpdate() throws Exception {
        manager(source(manifest(good).put("versionCode", current), good)); manager.check(true);
        until(() -> !manager.snapshot().getBoolean("checking")); assertFalse(manager.snapshot().getBoolean("available"));
    }
    @Test public void cValidSignedApkIsSavedAndOfflineCandidateSurvivesRestart() throws Exception {
        JSONObject descriptor = manifest(good); manager(source(descriptor, good)); available(); download();
        assertEquals("ready", manager.snapshot().getString("phase")); assertTrue(manager.snapshot().getBoolean("downloaded"));
        File apk = new File(context.getFilesDir(), "updates/update-" + targetCode + ".apk"); assertEquals(good.length, apk.length());
        manager.verifyArchive(apk, ApkUpdate.parse(descriptor, context.getPackageName(), Build.VERSION.SDK_INT, certificate));
        manager.close(); manager(address -> { throw new IOException("Offline"); });
        assertTrue(manager.snapshot().getBoolean("downloaded")); manager.check(true);
        until(() -> !manager.snapshot().getBoolean("checking")); assertTrue(manager.snapshot().getBoolean("available")); assertTrue(manager.snapshot().getBoolean("downloaded"));
    }
    @Test public void dTruncatedOrCorruptDownloadIsRejected() throws Exception {
        JSONObject descriptor = manifest(good); byte[] corrupt = good.clone(); corrupt[1000] ^= 1;
        manager(source(descriptor, corrupt)); available(); download();
        assertEquals("error", manager.snapshot().getString("phase")); assertFalse(manager.snapshot().getBoolean("downloaded"));
        assertFalse(new File(context.getFilesDir(), "updates/update-" + targetCode + ".apk").exists());
    }
    @Test public void eCorrectHashButDifferentSignerIsRejected() throws Exception {
        manager(source(manifest(otherSigner), otherSigner)); available(); download();
        assertEquals("error", manager.snapshot().getString("phase")); assertFalse(manager.snapshot().getBoolean("downloaded"));
    }
    @Test public void fManifestCannotMislabelApkVersion() throws Exception {
        manager(source(manifest(good).put("versionCode", targetCode + 1), good)); available(); download();
        assertEquals("error", manager.snapshot().getString("phase")); assertFalse(manager.snapshot().getBoolean("downloaded"));
    }
    @Test public void gDownloadCanBeCancelledWithoutPartialInstallFile() throws Exception {
        JSONObject descriptor = manifest(good);
        manager(address -> {
            if (address.contains("stable.json")) return new ByteArrayInputStream(descriptor.toString().getBytes(StandardCharsets.UTF_8));
            return new ByteArrayInputStream(good) {
                @Override public synchronized int read(byte[] bytes, int offset, int length) {
                    try { Thread.sleep(25); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
                    return super.read(bytes, offset, Math.min(length, 1024));
                }
            };
        });
        available(); manager.download(); until(() -> manager.snapshot().getLong("received") > 0); manager.cancel();
        until(() -> !manager.snapshot().getString("phase").equals("downloading"));
        assertFalse(manager.snapshot().getBoolean("downloaded")); assertFalse(new File(context.getFilesDir(), "updates/update-" + targetCode + ".apk").exists());
    }
    @Test public void hGitHubHttpsTransportDownloadsPublishedApk() throws Exception {
        byte[] bytes;
        try (InputStream input = new GitHubUpdateSource().open("https://raw.githubusercontent.com/bogdanhpk/WePlay/main/downloads/WePlay-AndroidTV-1.0.0.apk")) {
            bytes = ApkUpdates.read(input, 10 * 1024 * 1024);
        }
        assertEquals("2a353e389bef089076448ed91f2285c8caf02a905fbee30b1154dc4adace68e5", ApkUpdates.hex(MessageDigest.getInstance("SHA-256").digest(bytes)));
    }
    @Test public void iNewMetadataCannotReplaceAnInFlightDownload() throws Exception {
        JSONObject original = manifest(good), newer = manifest(good).put("versionCode", targetCode + 1);
        java.util.concurrent.atomic.AtomicInteger checks = new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.CountDownLatch blocked = new java.util.concurrent.CountDownLatch(1), release = new java.util.concurrent.CountDownLatch(1);
        manager(address -> {
            if (!address.contains("stable.json")) return new ByteArrayInputStream(good);
            if (checks.incrementAndGet() == 1) return new ByteArrayInputStream(original.toString().getBytes(StandardCharsets.UTF_8));
            blocked.countDown(); release.await(5, java.util.concurrent.TimeUnit.SECONDS);
            return new ByteArrayInputStream(newer.toString().getBytes(StandardCharsets.UTF_8));
        });
        available(); manager.check(true); assertTrue(blocked.await(5, java.util.concurrent.TimeUnit.SECONDS));
        manager.download(); release.countDown(); until(() -> !manager.snapshot().getString("phase").equals("downloading"));
        assertTrue(manager.snapshot().getBoolean("downloaded")); assertEquals(targetCode, manager.snapshot().getLong("versionCode"));
    }
    @Test public void zSeedValidatedCandidateForRemoteAndInstallerUiTest() throws Exception {
        manager(source(manifest(good), good)); available(); download(); assertTrue(manager.snapshot().getBoolean("downloaded"));
    }
}
