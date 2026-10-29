package app.weplay.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;

/** A TV shell: the bundled UI owns focus, navigation, playback and watch history. */
public final class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private WebView web;
    private boolean ready;
    private boolean resumed, waitingPermission;
    private ApkUpdates updates;
    private static final int UPDATE_PERMISSION = 71, UPDATE_INSTALL = 72;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setHorizontalScrollBarEnabled(false);
        web.setVerticalScrollBarEnabled(false);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        try {
            updates = new ApkUpdates(this, new ApkUpdates.Listener() {
                @Override public void state(JSONObject state) { updateState(state); }
                @Override public void install(File file) { launchInstaller(file); }
            });
            // Only the bundled page is ever loaded. Frames and provider scripts are blocked by CSP.
            web.addJavascriptInterface(new UpdateBridge(), "WePlayUpdateBridge");
        } catch (Exception ignored) { /* Browsing still works if update storage is unavailable. */ }
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        NetworkTransport network = new NetworkTransport(settings.getUserAgentString());
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority()) && "/network".equals(uri.getPath()))
                    return network.load(request);
                WebResourceResponse local = assets.shouldInterceptRequest(uri);
                if (local != null && local.getMimeType().equals("text/html")) {
                    java.util.Map<String,String> headers = new java.util.HashMap<>();
                    headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'");
                    local.setResponseHeaders(headers);
                }
                return local;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // A provider response is data only: never open it as a page or external browser.
                if ((ORIGIN + "/exit").equals(request.getUrl().toString())) finish();
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                ready = true;
                web.requestFocus();
                if (updates != null) updates.status();
            }
        });
        setContentView(web);
        web.loadUrl(ORIGIN + "/assets/weplay/index.html");
        web.requestFocus();
    }

    private boolean localPage() { return web != null && (ORIGIN + "/assets/weplay/index.html").equals(web.getUrl()); }
    private void updateState(JSONObject state) {
        if (!localPage()) return;
        String encoded = Base64.encodeToString(state.toString().getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        web.evaluateJavascript("window.WePlayAndroidUpdates&&WePlayAndroidUpdates.receive(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('" + encoded + "'),function(c){return c.charCodeAt(0);}))))", null);
    }
    private final class UpdateBridge {
        @JavascriptInterface public void postMessage(String raw) {
            if (raw == null || raw.length() > 512) return;
            runOnUiThread(() -> {
                if (!localPage() || updates == null) return;
                try {
                    JSONObject command = new JSONObject(raw); String action = command.getString("action");
                    if (action.equals("status")) { updates.status(); return; }
                    if (action.equals("cancel")) { updates.cancel(); return; }
                    if (!resumed || !command.optBoolean("idle", false)) {
                        if (action.equals("download") || action.equals("install")) updates.message("Завершите просмотр, затем обновите WePlay.");
                        return;
                    }
                    if (action.equals("check")) updates.check(false);
                    else if (action.equals("download")) updates.download();
                    else if (action.equals("install")) updates.install();
                } catch (Exception ignored) { }
            });
        }
    }

    private void launchInstaller(File file) {
        if (!resumed || !localPage()) { updates.message("Вернитесь в WePlay, чтобы установить обновление."); return; }
        if (!getPackageManager().canRequestPackageInstalls()) {
            updates.permissionRequired(); waitingPermission = true;
            try {
                startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())), UPDATE_PERMISSION);
            } catch (Exception unavailable) {
                waitingPermission = false;
                updates.message("Разрешите установку обновлений для WePlay в настройках безопасности телевизора.");
            }
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".updates", file);
            Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.putExtra(Intent.EXTRA_RETURN_RESULT, true);
            startActivityForResult(intent, UPDATE_INSTALL);
        } catch (Exception unavailable) { updates.message("Не удалось открыть установщик Android. Попробуйте ещё раз."); }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == UPDATE_INSTALL && updates != null)
            updates.message(result == RESULT_CANCELED ? "Установка отменена. Обновление можно установить позже." : "Если обновление не установлено, попробуйте ещё раз.");
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) { immersive(); if (updates != null) updates.status(); }
    }

    private int webKey(int key) {
        switch (key) {
            case KeyEvent.KEYCODE_DPAD_LEFT: return 37;
            case KeyEvent.KEYCODE_DPAD_UP: return 38;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 39;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 40;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER: return 13;
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE: return 27;
            case KeyEvent.KEYCODE_MEDIA_PLAY: return 415;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return 19;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return 10252;
            case KeyEvent.KEYCODE_MEDIA_STOP: return 413;
            case KeyEvent.KEYCODE_MEDIA_REWIND: return 412;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return 417;
            case KeyEvent.KEYCODE_MENU: return 457;
            default: return 0;
        }
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        int key = webKey(event.getKeyCode());
        if (key == 0) return super.dispatchKeyEvent(event);
        if (web != null && ready) {
            String type = event.getAction() == KeyEvent.ACTION_UP ? "keyup" : "keydown";
            web.evaluateJavascript("window.WePlayAndroid&&WePlayAndroid.key('" + type + "'," + key + "," + (event.getRepeatCount() > 0) + ")", null);
        }
        return true; // Prevent the WebView from also generating a second click/focus move.
    }

    @Override public void onBackPressed() {
        if (web != null && ready) web.evaluateJavascript("WePlayAndroid.key('keydown',27,false)", null);
        else finish();
    }

    @Override protected void onPause() {
        resumed = false;
        if (web != null) {
            web.evaluateJavascript("window.WePlayAndroid&&WePlayAndroid.pause()", null);
            web.onPause();
        }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        if (web != null) web.onResume();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();
        if (updates != null) {
            updates.status();
            if (waitingPermission) {
                waitingPermission = false;
                if (getPackageManager().canRequestPackageInstalls()) updates.install();
                else updates.permissionRequired();
            }
        }
    }

    @Override protected void onDestroy() {
        if (updates != null) updates.close();
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
