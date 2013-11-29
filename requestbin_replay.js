process.title = "requestbin_replay"

var _ = require('underscore');
var fs = require('fs');
var Request = require('superagent');

var fetchedRequests = [];
var interval = process.env.INTERVAL || 5000;
var hostname = process.env.REQUEST_HOST || 'requestb.in';
var binId = process.env.REQUEST_BIN; // Request Bin ID (Required, unless you override path)
var path = process.env.REQUEST_PATH || null; // set this to override the default requestb.in path
var localEndpoint = process.env.LOCAL_ENDPOINT // local URL to forward requests
var certPath = process.env.CERT_PATH // set the path to SSL certificate, if local endpoint is SSL

if (!(localEndpoint || (binId && path)))
  throw("You need to set LOCAL_ENDPOINT and REQUEST_BIN in an .env file");

var _computedPath = function() {
  if (path) {
    return path;
  } else {
    return "/api/v1/bins/" + binId + "/requests"
  }
};

console.log('Polling ' + hostname + ' for new requests in every ' + interval / 1000 + ' seconds.');

setInterval(function() {
  var requestBinUrl = hostname + _computedPath();
  Request.get(requestBinUrl, function(err, res) {
    if (err || !res.ok) {
      console.log ('----Following error occurred when fetching requests from RequestBin----');
      console.log (err || res.body.error);
      return;
    }

    var requests = res.body;

    _.each(requests, function(incoming) {
      // check if the given request is already fetched
      if (fetchedRequests.indexOf(incoming.id) === -1) {
        var outgoing = Request('POST', localEndpoint);

        //set the cert if the local endpoint requries to be SSL
        if (certPath)
          var cert = fs.readFileSync(certPath);
          outgoing.ca(cert);

        // copy the headers
        _.each(incoming.headers, function(v, k) {
          outgoing.set(k, v);
        });

        // copy the Content-Type
        outgoing.type(incoming.content_type);

        // copy the query strings
        _.each(incoming.query_string, function(v, k) {
          outgoing.query(k, v);
        });

        // send the body
        if (incoming.body)
          outgoing.send(incoming.body);

        // send form-data
        if (incoming.form_data.length) {
          _.each(incoming.form_data, function(d) {
            if (Array.isArray(d)) {
              outgoing.send(d.join('='));
            } else {
              outgoing.send(d);
            }
          });
        }

        outgoing.end();
        fetchedRequests.push(incoming.id);
        console.log('Replayed request ' + incoming.id);
      }
    });

  });
}, interval);
