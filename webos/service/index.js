'use strict';
const Service = require('webos-service');
const createTransport = require('./transport');

const service = new Service('app.weplay.tv.network');
let transport;
service.register('connect', function (message) {
  if (message.sender !== 'app.weplay.tv' || !message.isSubscription) {
    message.respond({returnValue: false, errorText: 'WePlay subscription required'});
    return;
  }

  // The subscription keeps the service alive while the app is using the transport.
  if (!transport) transport = createTransport();
  transport.then(function (endpoint) {
    message.respond({returnValue: true, subscribed: true, endpoint: endpoint});
  }, function () {
    transport = null;
    message.respond({returnValue: false, errorText: 'Could not start transport'});
  });
});
