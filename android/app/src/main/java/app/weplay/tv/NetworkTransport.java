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
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Same-origin GET/HEAD transport. Runs on WebView worker threads, never the UI thread. */
final class NetworkTransport {
    private final String userAgent;
    private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
    NetworkTransport(String userAgent) { this.userAgent = userAgent; }

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
            boolean credentials = "include".equals(route.getQueryParameter("credentials"));
            URL initial = url;
            for (int hop = 0; hop < 6; hop++) {
                connection = (HttpURLConnection)url.openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(20000);
                connection.setRequestMethod(method);
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
