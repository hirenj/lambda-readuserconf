'use strict';
/*jshint esversion: 6, node:true */

var AWS = require('lambda-helpers').AWS;
var dynamo =  new AWS.DynamoDB.DocumentClient();
var s3 = new AWS.S3();

var table_promises = {};

var make_items = function(grant) {
  grant.id = grant.id;
  grant.valid_to = grant.valid_to || 9007199254740991;
  grant.valid_from = grant.valid_from || 0;
  grant.users = (grant.users && grant.users.length > 0) ? grant.users : ['none'];
  grant.superusers = (grant.superusers && grant.superusers.length > 0) ? grant.superusers : ['none'];;
  grant.proteins = grant.proteins || '*';
  grant.datasets = grant.datasets || 'none/none';
  return { 'Item': grant };
};

var get_existing_grants = function(table) {
  var params = {
    TableName : table,
    ProjectionExpression : '#name,#users,valid_to',
    ExpressionAttributeNames:{
      "#name" : "id",
      "#users" : "users"
    }
  };
  return dynamo.scan(params).promise().then( (data) => {
    return( (data.Items || []).filter( item => item[0] !== 'none' ));
  });
};

var put_grants = function(table,grants) {
  return get_existing_grants(table).then( existing => {
    let toadd = grants.map(function(grant) { return grant.id; });
    existing.forEach(function(current) {
      if (toadd.indexOf(current.id) < 0) {
        console.log("Need to remove ",current);
        delete current.users;
        delete current.superusers;
        grants.push(current);
      }
    });
    let params = {};
    return Promise.all(grants.map(make_items).map( (item) => {
      let params = item;
      params.TableName = table;
      return dynamo.put(params).promise();
    }));
  });
};

const retrieve_json = function(bucket,key) {
  let params = {
    Bucket: bucket,
    Key: key
  };
  if (key.match(/\/$/)) {
    return Promise.resolve();
  }
  return s3.getObject(params).promise().then( (data) => {
    console.log(data.Body.toString());
    let json = JSON.parse(data.Body.toString());
    return { 'Key' : key, 'json' : json };
  });
};

const read_group_config = function(bucket) {
  let params = {
    Bucket: bucket,
    Prefix: 'conf/groups'
  };
  console.log(params);
  return s3.listObjectsV2(params).promise().then( keys => {
    let group_keys = keys.Contents.map((object) => object.Key );
    console.log("Groups",group_keys);
    return Promise.all(group_keys.map(retrieve_json.bind(null,bucket)));
  });
};

const read_grant_config = function(bucket) {
  let params = {
    Bucket: bucket,
    Prefix: 'conf/grants'
  };
  console.log(params);
  return s3.listObjectsV2(params).promise().then( keys => {
    let grant_keys = keys.Contents.map((object) => object.Key );
    console.log("Grants",grant_keys);
    return Promise.all(grant_keys.map(retrieve_json.bind(null,bucket)));
  });
};

const onlyUnique = function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
};

const sample_group = {
  'groupid' : 'Some group',
  'users' : ['email@domain']
};
const sample_grant = {
  'id' : 'Some grant',
  'valid_from' : '',
  'valid_to' : '',
  'users' : ['email@domain']
};


const populate_grant_users = function(grant,groups) {
  if (grant.groups && Array.isArray(grant.groups)) {
    let wanted_groups = groups.filter( (group) => grant.groups.indexOf( group.groupid ) >= 0).map( (group) => group.users );
    grant.users = (grant.users || []).concat([].concat.apply([], wanted_groups)).filter(onlyUnique);
  }
};

const populate_grants = function(bucket) {
  return Promise.all([read_group_config(bucket),read_grant_config(bucket) ]).then( configs => {
    let groups = configs[0].filter( (val) => val ).map( (block) => block.json );
    let grants = configs[1].filter( (val) => val ).map( (block) => block.json );
    grants.forEach((grant) => populate_grant_users(grant,groups) );
    return grants;
  });
};

exports.readGrantConfig = populate_grants;
exports.putGrants = put_grants;