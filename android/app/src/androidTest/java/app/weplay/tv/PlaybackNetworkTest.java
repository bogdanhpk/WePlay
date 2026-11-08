package app.weplay.tv;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class PlaybackNetworkTest {
    @Test public void playbackCancelsAnActiveCheckAndResumesOnlyAfterExit() throws Exception {
        AtomicInteger requests = new AtomicInteger(), cancellations = new AtomicInteger();
        CountDownLatch started = new CountDownLatch(1), cancelled = new CountDownLatch(1), resumed = new CountDownLatch(1);
        ApkUpdates.Source source = new ApkUpdates.Source() {
            public InputStream open(String address) throws Exception {
                if (requests.incrementAndGet() == 1) { started.countDown(); assertTrue(cancelled.await(5, TimeUnit.SECONDS)); }
                else resumed.countDown();
                return new ByteArrayInputStream("{}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            public void playback(boolean active) { if (active) { cancellations.incrementAndGet(); cancelled.countDown(); } }
        };
        ApkUpdates updates = new ApkUpdates(InstrumentationRegistry.getInstrumentation().getTargetContext(), null, source, BuildConfig.UPDATE_MANIFEST_URL);
        try {
            updates.check(true); assertTrue(started.await(5, TimeUnit.SECONDS));
            updates.playback(true); assertEquals(1, cancellations.get()); assertFalse(updates.snapshot().getBoolean("checking"));
            updates.check(true); Thread.sleep(150); assertEquals(1, requests.get());
            updates.playback(false); assertTrue(resumed.await(5, TimeUnit.SECONDS)); assertEquals(2, requests.get());
        } finally { updates.close(); }
    }
    @Test public void pausedGitHubTransportDoesNotOpenAConnection() throws Exception {
        GitHubUpdateSource source = new GitHubUpdateSource(); source.playback(true);
        try { source.open("https://raw.githubusercontent.com/bogdanhpk/WePlay/main/updates/android/stable.json"); fail("Connection opened during playback"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("Playback")); }
    }
}
