/* Device adapters translate OS events before they reach shared screens and dialogs. */
(function () {
  'use strict';
  var android = window.WePlayAndroid, lg = window.WePlayWebOS;
  var samsung = !android && !lg && window.tizen;
  var nativeForeground = true, foreground = !document.hidden;
  var lastSamsungSource = '', lastSamsungBack = 0;

  function key(type, code, repeat) {
    var names = {13: 'Enter', 27: 'Escape', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown'};
    var event = new KeyboardEvent(type, {
      key: names[code] || 'Unidentified', bubbles: true, cancelable: true, repeat: !!repeat
    });
    // Older TV engines ignore these read-only legacy values in the constructor.
    Object.defineProperty(event, 'keyCode', {value: code});
    Object.defineProperty(event, 'which', {value: code});
    (document.activeElement || document).dispatchEvent(event);
  }

  function samsungBack(source, event) {
    if (event.repeat) return;
    var now = Date.now();
    if (lastSamsungSource !== source && now - lastSamsungBack < 180) return;
    lastSamsungSource = source;
    lastSamsungBack = now;
    key('keydown', 27, false);
  }

  window.addEventListener('keydown', function (event) {
    var code = event.keyCode || event.which;
    if (code !== 10009 && !(lg && code === 461)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (code === 10009) samsungBack('keydown', event);
    else if (!event.repeat) key('keydown', 27, false);
  }, true);

  if (samsung) {
    document.addEventListener('tizenhwkey', function (event) {
      if (event.keyName !== 'back') return;
      event.preventDefault();
      samsungBack('tizenhwkey', event);
    }, true);

    var input = samsung.tvinputdevice;
    if (input) ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind',
      'MediaFastForward', 'Info', 'ColorF0Red', 'ChannelUp', 'ChannelDown'].forEach(function (name) {
      try { input.registerKey(name); } catch (ignore) {}
    });
  }

  function syncForeground() {
    var visible = nativeForeground && !document.hidden;
    if (foreground === visible) return;
    foreground = visible;
    window.dispatchEvent(new CustomEvent('weplay:foreground', {detail: visible}));
  }

  document.addEventListener('visibilitychange', syncForeground);
  window.WePlayTV = {
    name: android ? 'android' : lg ? 'webos' : samsung ? 'tizen' : 'browser',
    key: key,
    isForeground: function () { return foreground; },
    setForeground: function (visible) {
      nativeForeground = !!visible;
      syncForeground();
    },
    mediaURL: function (url) {
      var adapter = android || lg;
      return adapter && adapter.mediaURL ? adapter.mediaURL(url) : url;
    },
    exit: function () {
      if (android || lg) {
        (android || lg).exit();
        return true;
      }
      if (samsung && samsung.application) {
        try { samsung.application.getCurrentApplication().exit(); return true; } catch (ignore) {}
      }
      return false;
    }
  };
}());
