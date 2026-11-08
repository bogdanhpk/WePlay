package app.weplay.tv;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONObject;

/** Same-origin transport with a read-only catalog search operation. Runs off the UI thread. */
final class NetworkTransport {
    private final String userAgent;
    private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
    NetworkTransport(String userAgent) { this.userAgent = userAgent; }

    private byte[] catalogSearch(URL url, String raw) throws Exception {
        if (!url.getHost().matches("lordfilm26-kino[0-9]+\\.lat") ||
            !url.getPath().equals("/engine/ajax/controller.php") || !"mod=media_catalog".equals(url.getQuery()) || raw.length() > 1024)
            throw new IOException("Invalid catalog search");
        JSONObject fields = new JSONObject(raw);
        String query = fields.getString("query"), csrf = fields.getString("csrf");
        if (query.trim().isEmpty() || query.length() > 160 || !csrf.matches("[a-fA-F0-9]{32,128}"))
            throw new IOException("Invalid catalog search");
        return ("action=search&query=" + URLEncoder.encode(query, "UTF-8") + "&csrf=" + URLEncoder.encode(csrf, "UTF-8"))
            .getBytes(StandardCharsets.UTF_8);
    }

    private URL publicHttps(String value) throws IOException {
        URL url = new URL(value);
        if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null ||
            url.getPort() != -1 && url.getPort() != 443) throw new IOException("HTTPS required");
        for (InetAddress address : InetAddress.getAllByName(url.getHost())) {
            if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()
                || (address.getAddress().length == 16 && (address.getAddress()[0] & 0xfe) == 0xfc))
                throw new IOException("Public destination required");
        }
        return url;
    }

    WebResourceResponse load(WebResourceRequest request) {
        HttpURLConnection connection = null;
        try {
            String method = request.getMethod();
            if (!method.equals("GET") && !method.equals("HEAD")) return failure(405, "Method Not Allowed");
            Uri route = request.getUrl();
            URL url = publicHttps(route.getQueryParameter("url"));
            String search = route.getQueryParameter("catalogSearch");
            if (search != null && !method.equals("GET")) return failure(405, "Method Not Allowed");
            boolean credentials = "include".equals(route.getQueryParameter("credentials"));
            URL initial = url;
            for (int hop = 0; hop < 6; hop++) {
                byte[] searchBody = search == null ? null : catalogSearch(url, search);
                connection = (HttpURLConnection)url.openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(searchBody == null ? 20000 : 30000);
                connection.setRequestMethod(searchBody == null ? method : "POST");
                connection.setRequestProperty("User-Agent", userAgent);
                connection.setRequestProperty("Accept-Encoding", "identity");
                for (Map.Entry<String,String> header : request.getRequestHeaders().entrySet()) {
                    String name = header.getKey();
                    if (name.equalsIgnoreCase("Accept") || name.equalsIgnoreCase("Accept-Language")
                        || name.equalsIgnoreCase("Range") || name.equalsIgnoreCase("If-Range")
                        || name.equalsIgnoreCase("Authorization") && initial.getHost().equals(url.getHost()))
                        connection.setRequestProperty(name, header.getValue());
                }
                URI uri = url.toURI();
                if (credentials) {
                    for (Map.Entry<String,List<String>> header : cookies.get(uri, Collections.emptyMap()).entrySet())
                        connection.setRequestProperty(header.getKey(), String.join("; ", header.getValue()));
                }
                if (searchBody != null) {
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
                    connection.setRequestProperty("Referer", "https://" + url.getHost() + "/");
                    connection.setFixedLengthStreamingMode(searchBody.length);
                    try (java.io.OutputStream output = connection.getOutputStream()) { output.write(searchBody); }
                }
                int code = connection.getResponseCode();
                if (credentials) cookies.put(uri, connection.getHeaderFields());
                if (code >= 300 && code < 400 && code != 304) {
                    String destination = connection.getHeaderField("Location");
                    if (destination == null) throw new IOException("Missing redirect");
                    URL next = publicHttps(new URL(url, destination).toString());
                    connection.disconnect(); connection = null; url = next; continue;
                }
                String type = connection.getContentType(), mime = type == null ? "application/octet-stream" : type.split(";")[0].trim();
                String encoding = null;
                if (type != null) for (String part : type.split(";"))
                    if (part.trim().toLowerCase(Locale.ROOT).startsWith("charset=")) encoding = part.trim().substring(8).replace("\"", "");
                Map<String,String> headers = new HashMap<>();
                for (String name : new String[]{"Content-Length", "Content-Range", "Accept-Ranges", "Cache-Control", "ETag", "Last-Modified", "Retry-After", "Date"}) {
                    String value = connection.getHeaderField(name); if (value != null) headers.put(name, value);
                }
                headers.put("X-WePlay-Final-URL", url.toString());
                InputStream body = method.equals("HEAD") ? new ByteArrayInputStream(new byte[0])
                    : code >= 400 ? connection.getErrorStream() : connection.getInputStream();
                if (body == null) body = new ByteArrayInputStream(new byte[0]);
                final HttpURLConnection owner = connection;
                InputStream stream = new FilterInputStream(body) {
                    @Override public void close() throws IOException { try { super.close(); } finally { owner.disconnect(); } }
                };
                return new WebResourceResponse(mime, encoding, code, code >= 400 ? "Upstream Error" : "OK", headers, stream);
            }
            throw new IOException("Too many redirects");
        } catch (Exception error) {
            if (connection != null) connection.disconnect();
            // Do not log URLs, playback tokens, authorization or response bodies.
            return failure(502, "Bad Gateway");
        }
    }

    private WebResourceResponse failure(int code, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", code, reason, Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
}
