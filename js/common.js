'use strict';
/*jshint esversion: 6, node:true */

let config = {};

let grants = require('./grants');
let grants_table = 'grants';
let bucket_name = 'data';

try {
  config = require('../resources.conf.json');
  grants_table = config.tables.grants;
  bucket_name = config.buckets.dataBucket;
} catch (e) {
}

if (config.region) {
  require('lambda-helpers').AWS.setRegion(config.region);
}

const readUserConf = function(event,context) {
  let grantdata = grants.readGrantConfig(bucket_name);
  grantdata.then( grants => {
    console.log(grants);
  });
  grantdata.then(grants.putGrants.bind(null,grants_table)).then( () => {
    context.succeed('OK');
  }).catch( (err) => {
    context.fail(err);
  });
};

exports.readUserConf = readUserConf;