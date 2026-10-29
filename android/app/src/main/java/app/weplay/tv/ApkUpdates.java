package app.weplay.tv;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Owns only files/updates. WebView storage, viewing history and favourites are never modified. */
final class ApkUpdates {
    interface Source { InputStream open(String address) throws Exception; }
    interface Listener { void state(JSONObject state); void install(File file); }
    private final Context context;
    private final File directory;
    private final AtomicFile metadata;
    private final Source source;
    private final String manifestUrl, certificate;
    private final long installedCode;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile Listener listener;
    private ApkUpdate candidate;
    private boolean checking, downloading, downloaded, installing, permission;
    private volatile boolean closed;
    private volatile boolean cancelled;
    private long lastCheck, received;
    private String error = "";

    ApkUpdates(Context context, Listener listener) throws Exception {
        this(context, listener, new GitHubUpdateSource(), BuildConfig.UPDATE_MANIFEST_URL);
    }
    ApkUpdates(Context context, Listener listener, Source source, String manifestUrl) throws Exception {
        this.context = context.getApplicationContext(); this.listener = listener; this.source = source; this.manifestUrl = manifestUrl;
        PackageInfo installed = packageInfo(context.getPackageName());
        installedCode = versionCode(installed); certificate = certificate(installed);
        directory = new File(context.getFilesDir(), "updates");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Update directory unavailable");
        metadata = new AtomicFile(new File(directory, "candidate.json"));
        for (File file : safeFiles()) if (file.getName().endsWith(".part")) file.delete();
        restore();
    }
    private File[] safeFiles() { File[] files = directory.listFiles(); return files == null ? new File[0] : files; }
    static long versionCode(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
    private int signatureFlags() { return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES; }
    private PackageInfo packageInfo(String name) throws Exception { return context.getPackageManager().getPackageInfo(name, signatureFlags()); }
    static String hex(byte[] bytes) { StringBuilder s = new StringBuilder(); for (byte b : bytes) s.append(String.format(java.util.Locale.ROOT, "%02x", b & 255)); return s.toString(); }
    static String certificate(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28 ? info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners() : info.signatures;
        if (signatures == null || signatures.length != 1) throw new IOException("One application signer required");
        return hex(MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray()));
    }
    private ApkUpdate parse(JSONObject json) throws Exception { return ApkUpdate.parse(json, context.getPackageName(), Build.VERSION.SDK_INT, certificate); }
    private File apk(ApkUpdate update) { return new File(directory, "update-" + update.code + ".apk"); }
    private void restore() {
        try (InputStream input = metadata.openRead()) {
            ApkUpdate cached = parse(new JSONObject(new String(read(input, 65536), StandardCharsets.UTF_8)));
            if (cached.code > installedCode) { candidate = cached; downloaded = apk(cached).isFile() && apk(cached).length() == cached.size; }
            else { metadata.delete(); apk(cached).delete(); }
        } catch (Exception ignored) { metadata.delete(); }
    }
    private void persist(ApkUpdate update) throws Exception {
        FileOutputStream output = metadata.startWrite();
        try { output.write(update.json.toString().getBytes(StandardCharsets.UTF_8)); metadata.finishWrite(output); }
        catch (Exception failure) { metadata.failWrite(output); throw failure; }
    }
    static byte[] read(InputStream input, int limit) throws Exception {
        ByteArrayOutputStream data = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
        while ((count = input.read(buffer)) != -1) { if (data.size() + count > limit) throw new IOException("Response too large"); data.write(buffer, 0, count); }
        return data.toByteArray();
    }
    synchronized JSONObject snapshot() {
        JSONObject result = new JSONObject();
        try {
            result.put("phase", downloading ? "downloading" : installing ? "installing" : permission ? "permission" : !error.isEmpty() ? "error" : candidate == null ? "idle" : downloaded ? "ready" : "available");
            result.put("currentVersion", BuildConfig.VERSION_NAME); result.put("currentVersionCode", installedCode);
            result.put("available", candidate != null); result.put("version", candidate == null ? "" : candidate.version);
            result.put("versionCode", candidate == null ? 0 : candidate.code); result.put("size", candidate == null ? 0 : candidate.size);
            result.put("downloaded", downloaded); result.put("received", received); result.put("checking", checking);
            result.put("error", error); result.put("canInstall", context.getPackageManager().canRequestPackageInstalls());
        } catch (Exception ignored) { }
        return result;
    }
    private synchronized void emit() { JSONObject state = snapshot(); main.post(() -> { Listener sink = listener; if (!closed && sink != null) sink.state(state); }); }
    synchronized void status() { emit(); }
    synchronized void check(boolean force) {
        if (closed || checking || downloading || installing || !force && System.currentTimeMillis() - lastCheck < 60000) { emit(); return; }
        lastCheck = System.currentTimeMillis(); checking = true; emit();
        worker.execute(() -> {
            ApkUpdate update = null; boolean failed = false;
            try (InputStream input = source.open(manifestUrl + (manifestUrl.contains("?") ? "&" : "?") + "check=" + System.currentTimeMillis() / 60000)) {
                update = parse(new JSONObject(new String(read(input, 65536), StandardCharsets.UTF_8)));
            } catch (Exception ignored) { failed = true; }
            ApkUpdate found = update; boolean unavailable = failed;
            main.post(() -> {
                synchronized (ApkUpdates.this) {
                    if (closed) return; checking = false;
                    if (!downloading && !installing && !permission && !unavailable && found != null && found.code > installedCode && (candidate == null || found.code > candidate.code)) {
                        candidate = found; downloaded = false; received = 0; permission = false; error = "";
                        try { persist(found); } catch (Exception ignored) { }
                    }
                    // A stale GitHub edge or offline check must not discard a newer cached update.
                    emit();
                }
            });
        });
    }
    synchronized void download() {
        if (closed || candidate == null || downloading || installing) return;
        ApkUpdate update = candidate; downloading = true; downloaded = false; permission = false; cancelled = false; error = ""; received = 0; emit();
        worker.execute(() -> {
            File part = new File(directory, "update-" + update.code + "-" + java.util.UUID.randomUUID() + ".part"); String message = ""; boolean success = false;
            try {
                if (directory.getUsableSpace() < update.size + 8 * 1024 * 1024) throw new IOException("Storage unavailable");
                MessageDigest digest = MessageDigest.getInstance("SHA-256"); long count = 0, last = 0;
                try (InputStream input = source.open(update.url); FileOutputStream output = new FileOutputStream(part)) {
                    byte[] buffer = new byte[32768]; int length;
                    while ((length = input.read(buffer)) != -1) {
                        if (cancelled || closed || Thread.currentThread().isInterrupted()) throw new IOException("Cancelled");
                        count += length; if (count > update.size) throw new IOException("APK exceeds expected size");
                        output.write(buffer, 0, length); digest.update(buffer, 0, length);
                        long progress = count;
                        if (System.currentTimeMillis() - last > 200) { last = System.currentTimeMillis(); main.post(() -> { synchronized (ApkUpdates.this) { if (downloading && candidate == update) { received = progress; emit(); } } }); }
                    }
                    output.getFD().sync();
                }
                if (cancelled || count != update.size || !hex(digest.digest()).equals(update.sha256)) throw new IOException("APK checksum mismatch");
                verifyArchive(part, update);
                if (cancelled) throw new IOException("Cancelled");
                File ready = apk(update); if (ready.exists() && !ready.delete()) throw new IOException("Cannot replace cache");
                if (!part.renameTo(ready)) throw new IOException("Cannot save APK");
                persist(update); success = true;
            } catch (Exception ignored) {
                message = cancelled ? "" : "Не удалось загрузить или проверить обновление. Попробуйте ещё раз.";
            } finally { part.delete(); }
            boolean ready = success; String failure = message;
            main.post(() -> { synchronized (ApkUpdates.this) {
                if (closed || candidate != update) return;
                downloading = false; downloaded = ready; error = failure; received = ready ? update.size : 0;
                if (ready) for (File old : safeFiles()) if (old.getName().matches("update-[0-9]+\\.apk") && !old.equals(apk(update))) old.delete();
                emit();
            } });
        });
    }
    void verifyArchive(File file, ApkUpdate update) throws Exception {
        if (!file.isFile() || file.length() != update.size) throw new IOException("Invalid APK size");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) { byte[] buffer = new byte[32768]; int count; while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count); }
        if (!hex(digest.digest()).equals(update.sha256)) throw new IOException("Invalid APK hash");
        PackageInfo archive = context.getPackageManager().getPackageArchiveInfo(file.getPath(), signatureFlags());
        if (archive == null || !context.getPackageName().equals(archive.packageName) || versionCode(archive) != update.code
            || update.code <= installedCode || !update.version.equals(archive.versionName) || !certificate.equals(certificate(archive))
            || archive.applicationInfo == null || archive.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT)
            throw new IOException("Wrong APK package, version or signing certificate");
    }
    synchronized void install() {
        if (closed || candidate == null || !downloaded || downloading || installing) return;
        ApkUpdate update = candidate; installing = true; permission = false; cancelled = false; error = ""; emit();
        worker.execute(() -> {
            boolean valid;
            try { verifyArchive(apk(update), update); valid = true; } catch (Exception ignored) { valid = false; }
            boolean verified = valid;
            main.post(() -> { synchronized (ApkUpdates.this) {
                if (closed || candidate != update) return;
                if (cancelled) { installing = false; emit(); }
                else if (verified) { if (listener != null) listener.install(apk(update)); }
                else { downloaded = false; installing = false; error = "Файл обновления повреждён. Скачайте его заново."; apk(update).delete(); emit(); }
            } });
        });
    }
    synchronized void permissionRequired() { installing = false; permission = true; error = ""; emit(); }
    synchronized void message(String message) { installing = false; permission = false; error = message; emit(); }
    synchronized void cancel() { cancelled = true; permission = false; if (!downloading) error = ""; emit(); }
    synchronized void close() { closed = true; cancelled = true; listener = null; worker.shutdownNow(); }
}
