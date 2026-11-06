(function () {
  'use strict';
  var endpoint = '', connecting, subscription;
  var browserFetch = window.fetch.bind(window);
  var xhrOpen = XMLHttpRequest.prototype.open;
  var packaged = location.protocol === 'file:' && window.PalmServiceBridge && window.webOS && window.webOS.service;

  function disconnect() {
    var previous = subscription;
    subscription = null;
    connecting = null;
    endpoint = '';
    if (previous) previous.cancel();
  }

  function connect() {
    if (!packaged) return Promise.resolve('');
    if (connecting) return connecting;
    connecting = Promise.resolve().then(function () {
      return new Promise(function (resolve) {
        var timer = setTimeout(failed, 2000);
        function failed() {
          clearTimeout(timer);
          disconnect();
          resolve('');
        }
        subscription = webOS.service.request('luna://app.weplay.tv.network', {
          method: 'connect',
          subscribe: true,
          onSuccess: function (reply) {
            if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/[a-f0-9]{48}\/$/.test(reply.endpoint || '')) {
              failed();
              return;
            }
            clearTimeout(timer);
            endpoint = reply.endpoint;
            resolve(endpoint);
          },
          onFailure: failed
        });
      });
    });
    return connecting;
  }

  function transport(url, session) {
    return endpoint + '?url=' + encodeURIComponent(url) + (session ? '&session=1' : '');
  }

  function isRemote(url) { return /^https:\/\//i.test(url); }

  window.fetch = function (input, options) {
    var url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (!packaged || !isRemote(url)) return browserFetch(input, options);
    options = options || {};
    function load(retry) {
      return connect().then(function (address) {
        if (!address) return browserFetch(input, options);
        return browserFetch(transport(url, options.credentials === 'include'), Object.assign({}, options, {credentials: 'omit'})).then(function (response) {
          var finalURL = response.headers.get('X-WePlay-Final-URL') || url;
          Object.defineProperty(response, 'url', {value: finalURL});
          return response;
        }, function (error) {
          if (!retry || error.name !== 'TypeError' || options.signal && options.signal.aborted) throw error;
          if (endpoint === address) disconnect();
          return load(false);
        });
      });
    }
    return load(true);
  };

  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    if (endpoint && isRemote(String(url))) args[1] = transport(String(url), false);
    return xhrOpen.apply(this, args);
  };

  window.WePlayWebOS = {
    mediaURL: function (url) { return endpoint && isRemote(url) ? transport(url, false) : url; },
    exit: function () {
      if (window.webOS && webOS.platformBack) webOS.platformBack();
      else window.close();
    }
  };
}());
