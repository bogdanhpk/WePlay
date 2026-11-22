package app.weplay.tv;

import android.net.Uri;
import android.webkit.WebResourceResponse;
import androidx.media3.common.C;
import androidx.media3.datasource.BaseDataSource;
import androidx.media3.datasource.DataSpec;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Native playback keeps the same HTTPS, redirect and private-address rules as catalogs. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
final class PlaybackDataSource extends BaseDataSource {
    private final NetworkTransport transport;
    private InputStream input;
    private Uri uri;
    private long remaining;
    private boolean opened;
    private Map<String,List<String>> headers = Collections.emptyMap();

    PlaybackDataSource(NetworkTransport transport) { super(true); this.transport = transport; }

    @Override public long open(DataSpec spec) throws IOException {
        transferInitializing(spec);
        if (spec.httpMethod != DataSpec.HTTP_METHOD_GET) throw new IOException("Read-only playback transport");
        Map<String,String> request = new HashMap<>(spec.httpRequestHeaders);
        if (spec.position > 0 || spec.length != C.LENGTH_UNSET)
            request.put("Range", "bytes=" + spec.position + "-" + (spec.length == C.LENGTH_UNSET ? "" : spec.position + spec.length - 1));
        WebResourceResponse response = transport.media(spec.uri.toString(), request);
        input = response.getData();
        if (response.getStatusCode() < 200 || response.getStatusCode() >= 300) {
            close(); throw new IOException("Playback source HTTP " + response.getStatusCode());
        }
        Map<String,List<String>> received = new HashMap<>();
        for (Map.Entry<String,String> entry : response.getResponseHeaders().entrySet())
            received.put(entry.getKey(), Collections.singletonList(entry.getValue()));
        headers = received;
        uri = Uri.parse(response.getResponseHeaders().getOrDefault("X-WePlay-Final-URL", spec.uri.toString()));
        remaining = spec.length;
        if (remaining == C.LENGTH_UNSET) try {
            remaining = Long.parseLong(response.getResponseHeaders().getOrDefault("Content-Length", "-1"));
            if (response.getStatusCode() == 200) remaining = Math.max(-1, remaining - spec.position);
        } catch (NumberFormatException ignored) { remaining = C.LENGTH_UNSET; }
        opened = true; transferStarted(spec);
        if (response.getStatusCode() == 200 && spec.position > 0) {
            long skip = spec.position; byte[] scratch = new byte[8192];
            while (skip > 0) { int n = input.read(scratch, 0, (int)Math.min(skip, scratch.length)); if (n < 0) throw new IOException("Seek outside source"); skip -= n; }
        }
        return remaining;
    }

    @Override public int read(byte[] buffer, int offset, int length) throws IOException {
        if (length == 0) return 0;
        if (remaining == 0) return C.RESULT_END_OF_INPUT;
        int count = input.read(buffer, offset, remaining == C.LENGTH_UNSET ? length : (int)Math.min(length, remaining));
        if (count < 0) return C.RESULT_END_OF_INPUT;
        if (remaining != C.LENGTH_UNSET) remaining -= count;
        bytesTransferred(count); return count;
    }
    @Override public Uri getUri() { return uri; }
    @Override public Map<String,List<String>> getResponseHeaders() { return headers; }
    @Override public void close() throws IOException {
        try { if (input != null) input.close(); }
        finally { input = null; uri = null; headers = Collections.emptyMap(); if (opened) { opened = false; transferEnded(); } }
    }
}
