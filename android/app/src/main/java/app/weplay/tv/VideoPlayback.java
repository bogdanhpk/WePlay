package app.weplay.tv;

import android.app.Activity;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.FrameLayout;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.datasource.DataSource;
import androidx.media3.exoplayer.DecoderCounters;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** SurfaceView and Media3 share Android's audio clock; the WebView only draws controls. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
final class VideoPlayback {
    interface Listener { void state(JSONObject state); void visible(boolean visible); }
    private final Activity activity;
    private final NetworkTransport transport;
    private final PlayerView view;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private int session, sequence, width, height;
    private boolean rendered;
    private String decoder = "";
    private long processingUs, processingFrames;
    private final List<Track> videos = new ArrayList<>(), audios = new ArrayList<>(), subtitles = new ArrayList<>();
    private final Runnable tick = new Runnable() { @Override public void run() { if (player != null) { emit("state", false); main.postDelayed(this, 250); } } };

    private static final class Track {
        final Tracks.Group group; final int index; final String key;
        Track(Tracks.Group group, int index, int number) { this.group = group; this.index = index; key = number + ":" + index; }
        Format format() { return group.getTrackFormat(index); }
    }

    VideoPlayback(Activity activity, FrameLayout root, NetworkTransport transport, Listener listener) {
        this.activity = activity; this.transport = transport; this.listener = listener;
        view = new PlayerView(activity); view.setUseController(false); view.setControllerAutoShow(false);
        view.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT); view.setShutterBackgroundColor(Color.BLACK);
        view.setBackgroundColor(Color.BLACK); view.setVisibility(View.GONE); view.setFocusable(false);
        root.addView(view, 0, new FrameLayout.LayoutParams(-1, -1));
    }

    void open(int id, int sequence, String url, long position, String format) {
        release(); session = id; this.sequence = sequence; width = height = 0; rendered = false; decoder = ""; processingUs = processingFrames = 0;
        if (!url.startsWith("https://") || url.length() > 8192) { fail("Некорректный адрес видео"); return; }
        DataSource.Factory factory = () -> new PlaybackDataSource(transport);
        player = new ExoPlayer.Builder(activity).setMediaSourceFactory(new DefaultMediaSourceFactory(activity).setDataSourceFactory(factory)).build();
        ExoPlayer owner = player;
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true);
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build());
        player.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int state) { if (player == owner) emit(state == Player.STATE_ENDED ? "ended" : "state", false); }
            @Override public void onIsPlayingChanged(boolean playing) { if (player == owner) emit("state", false); }
            @Override public void onTracksChanged(Tracks tracks) { if (player == owner) { collect(tracks); emit("tracks", true); } }
            @Override public void onVideoSizeChanged(VideoSize size) { if (player == owner) { width = size.width; height = size.height; emit("state", false); } }
            @Override public void onRenderedFirstFrame() { if (player == owner) { rendered = true; emit("frame", false); } }
            @Override public void onPlayerError(PlaybackException error) { if (player == owner) fail("Не удалось воспроизвести видео (" + error.errorCode + ")", error.errorCode, error.errorCode == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED || error.errorCode == PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED || error.errorCode == PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES); }
        });
        player.addAnalyticsListener(new AnalyticsListener() {
            @Override public void onVideoDecoderInitialized(EventTime time, String name, long at, long duration) { if (player == owner) { decoder = name; emit("state", false); } }
            @Override public void onVideoFrameProcessingOffset(EventTime time, long total, int count) { if (player == owner) { processingUs += total; processingFrames += count; } }
        });
        view.setPlayer(player); view.setVisibility(View.VISIBLE); listener.visible(true);
        MediaItem.Builder item = new MediaItem.Builder().setUri(url);
        if ("hls".equals(format) || url.contains(".m3u8")) item.setMimeType("application/x-mpegURL");
        player.setMediaItem(item.build(), Math.max(0, position)); player.prepare(); main.post(tick);
    }

    private void collect(Tracks tracks) {
        videos.clear(); audios.clear(); subtitles.clear(); int number = 0;
        for (Tracks.Group group : tracks.getGroups()) {
            for (int i = 0; i < group.length; i++) {
                // Some TV codecs under-report 4K capabilities. Keep those variants for an
                // explicit user override; automatic selection still follows renderer limits.
                if (!group.isTrackSupported(i, group.getType() == C.TRACK_TYPE_VIDEO)) continue;
                Track track = new Track(group, i, number);
                if (group.getType() == C.TRACK_TYPE_VIDEO && track.format().width > 0 && track.format().height > 0) videos.add(track);
                else if (group.getType() == C.TRACK_TYPE_AUDIO) audios.add(track);
                else if (group.getType() == C.TRACK_TYPE_TEXT) subtitles.add(track);
            }
            number++;
        }
    }

    void command(int id, String action, JSONObject data) {
        if (id != session || player == null) return;
        sequence = data.optInt("sequence", sequence);
        switch (action) {
            case "play": player.play(); break;
            case "pause": player.pause(); break;
            case "seek": player.seekTo(Math.max(0, data.optLong("position"))); break;
            case "quality": select(C.TRACK_TYPE_VIDEO, videos, data.optInt("index", -1)); break;
            case "audio": select(C.TRACK_TYPE_AUDIO, audios, data.optInt("index", -1)); break;
            case "subtitle": select(C.TRACK_TYPE_TEXT, subtitles, data.optInt("index", -1)); break;
            case "volume": player.setVolume((float)Math.max(0, Math.min(1, data.optDouble("volume", 1)))); break;
            case "close": release(); return;
            default: return;
        }
        emit("state", false);
    }

    private void select(int type, List<Track> tracks, int index) {
        androidx.media3.common.TrackSelectionParameters.Builder params = player.getTrackSelectionParameters().buildUpon().clearOverridesOfType(type);
        if (index >= 0 && index < tracks.size()) {
            Track track = tracks.get(index); params.setTrackTypeDisabled(type, false).setOverrideForType(new TrackSelectionOverride(track.group.getMediaTrackGroup(), track.index));
        } else params.setTrackTypeDisabled(type, type == C.TRACK_TYPE_TEXT);
        player.setTrackSelectionParameters(params.build());
    }

    private JSONArray formats(List<Track> tracks) throws Exception {
        JSONArray array = new JSONArray();
        for (Track track : tracks) {
            Format f = track.format(); array.put(new JSONObject().put("key", track.key).put("width", Math.max(0, f.width)).put("height", Math.max(0, f.height)).put("bitrate", Math.max(0, f.bitrate)).put("name", f.label == null ? "" : f.label).put("lang", f.language == null ? "" : f.language));
        }
        return array;
    }

    private void emit(String event, boolean tracks) {
        if (player == null) return;
        try {
            long duration = player.getDuration();
            DecoderCounters counters = player.getVideoDecoderCounters(); if (counters != null) counters.ensureUpdated();
            JSONObject state = new JSONObject().put("session", session).put("sequence", sequence).put("event", event).put("position", player.getCurrentPosition()).put("duration", duration > 0 ? duration : 0).put("buffered", player.getBufferedPosition()).put("playing", player.isPlaying()).put("wantsPlay", player.getPlayWhenReady()).put("state", player.getPlaybackState()).put("width", width).put("height", height).put("rendered", rendered).put("decoder", decoder)
                .put("renderedFrames", counters == null ? 0 : counters.renderedOutputBufferCount).put("droppedFrames", counters == null ? 0 : counters.droppedBufferCount).put("processingOffsetUs", processingUs).put("processingFrames", processingFrames);
            Format actual = player.getVideoFormat(); int current = -1;
            for (int i = 0; actual != null && i < videos.size(); i++) { Format f = videos.get(i).format(); if (f.width == actual.width && f.height == actual.height && (f.id == null || f.id.equals(actual.id))) { current = i; break; } }
            state.put("currentLevel", current);
            if (tracks) state.put("levels", formats(videos)).put("audioTracks", formats(audios)).put("subtitleTracks", formats(subtitles));
            listener.state(state);
        } catch (Exception ignored) { }
    }

    private void fail(String message) { fail(message, 0, false); }
    private void fail(String message, int code, boolean fallback) { try { listener.state(new JSONObject().put("session", session).put("event", "error").put("message", message).put("code", code).put("fallback", fallback)); } catch (Exception ignored) { } }
    void pause() { if (player != null) player.pause(); }
    void release() {
        main.removeCallbacks(tick);
        if (player != null) { ExoPlayer old = player; player = null; view.setPlayer(null); old.release(); }
        videos.clear(); audios.clear(); subtitles.clear(); view.setVisibility(View.GONE); listener.visible(false);
    }
}
