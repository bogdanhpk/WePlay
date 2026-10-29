package app.weplay.tv;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;

/** TLS verification stays enabled; APKs and redirects are limited to GitHub-owned hosts. */
final class GitHubUpdateSource implements ApkUpdates.Source {
    @Override public InputStream open(String address) throws Exception {
        URL url = new URL(address);
        for (int hop = 0; hop < 6; hop++) {
            if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null
                || url.getPort() != -1 && url.getPort() != 443
                || !Arrays.asList("raw.githubusercontent.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com").contains(url.getHost()))
                throw new IOException("Unexpected update host");
            HttpURLConnection connection = (HttpURLConnection)url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000); connection.setReadTimeout(15000);
            connection.setUseCaches(false);
            connection.setRequestProperty("User-Agent", "WePlay-AndroidTV/" + BuildConfig.VERSION_NAME);
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("Cache-Control", "no-cache");
            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String next = connection.getHeaderField("Location");
                    if (next == null) throw new IOException("Missing redirect");
                    URL redirect = new URL(url, next); connection.disconnect(); url = redirect; continue;
                }
                if (status != 200) throw new IOException("Update HTTP " + status);
                return new FilterInputStream(connection.getInputStream()) {
                    @Override public void close() throws IOException { try { super.close(); } finally { connection.disconnect(); } }
                };
            } catch (Exception error) { connection.disconnect(); throw error; }
        }
        throw new IOException("Too many update redirects");
    }
}
