package app.weplay.tv;

import org.json.JSONObject;
import java.io.IOException;
import java.net.URI;

/** The Android channel uses versionCode; Tizen interface versions never enter this comparison. */
final class ApkUpdate {
    static final long MAX_BYTES = 100L * 1024 * 1024;
    final long code, size;
    final int minSdk;
    final String version, url, sha256, certificate;
    final JSONObject json;

    private ApkUpdate(JSONObject data) throws Exception {
        code = data.getLong("versionCode"); version = data.getString("versionName");
        minSdk = data.getInt("minSdk");
        JSONObject apk = data.getJSONObject("apk");
        size = apk.getLong("size"); url = apk.getString("url");
        sha256 = apk.getString("sha256"); certificate = apk.getString("certificateSha256");
        json = new JSONObject(data.toString());
    }

    static ApkUpdate parse(JSONObject data, String packageName, int sdk, String installedCertificate) throws Exception {
        if (data.getInt("schema") != 1 || !"android-tv".equals(data.getString("platform"))
            || !packageName.equals(data.getString("packageName"))) throw new IOException("Wrong update channel");
        ApkUpdate update = new ApkUpdate(data);
        if (!(data.get("versionCode") instanceof Number) || data.getDouble("versionCode") != update.code
            || !(data.get("minSdk") instanceof Number) || data.getDouble("minSdk") != update.minSdk
            || !(data.getJSONObject("apk").get("size") instanceof Number) || data.getJSONObject("apk").getDouble("size") != update.size
            || update.code < 1 || update.code > Integer.MAX_VALUE || update.minSdk < 26 || update.minSdk > sdk
            || !update.version.matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?")
            || update.size < 1024 || update.size > MAX_BYTES || !update.sha256.matches("[a-f0-9]{64}")
            || !update.certificate.matches("[a-f0-9]{64}") || !update.certificate.equals(installedCertificate))
            throw new IOException("Incompatible update");
        URI uri = new URI(update.url);
        if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null || uri.getFragment() != null
            || uri.getQuery() != null || uri.getPort() != -1) throw new IOException("Invalid APK address");
        String raw = "raw.githubusercontent.com", github = "github.com", p = uri.getRawPath();
        boolean allowed = raw.equals(uri.getHost()) && p.matches("/bogdanhpk/WePlay/(?:main|[a-f0-9]{40})/downloads/WePlay-AndroidTV-[A-Za-z0-9.-]+\\.apk")
            || github.equals(uri.getHost()) && p.matches("/bogdanhpk/WePlay/releases/download/[A-Za-z0-9._-]+/WePlay-AndroidTV-[A-Za-z0-9.-]+\\.apk");
        if (!allowed) throw new IOException("APK is outside the WePlay repository");
        return update;
    }
}
