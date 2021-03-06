var request = require('request'),
    shell = require('shelljs'),
    program = require('commander'),
    path = require('path'),
    common = require('./common.js'),
    bootstrap = {},
    config = {};

shell.silent();

if (!global.repo || !global.user || !global.pwd || !global.port) {
  console.log('Please specify repo, user credentials, and port number. See --help.');
  console.log();
  process.exit(1);
}

if (!shell.which('git')) {
  console.log('Bot.io needs git. Please install git in your PATH and try again.');
  console.log();
  process.exit(1);
}

var githubHooksUrl = 'https://'+global.user+':'+global.pwd+'@api.github.com/repos/'+global.repo+'/hooks';

// Copy bootstrap/ files into current dir
bootstrap.copyFiles = function() {
  console.log('Bot.io will create configuration files and scripts into the current directory.')
  console.log();

  if (!global.force) {
    console.log('WARNING: This will overwrite any existing files.')
    program.confirm('Continue? [y/n] ', function(ok) {
      if (!ok)
        process.exit(0);

      copyFiles();
    });
  } else {
    copyFiles();
  }

  function copyFiles() {
    var bootstrapDir = path.resolve(__dirname+'/../bootstrap/');
    if (!shell.test('-d', bootstrapDir)) {
      console.log('Could not find bootstrap files in:', bootstrapDir);
      process.exit(1);
    }

    shell.cp('-f', bootstrapDir+'/*', '.');

    process.stdout.write('Installing necessary npm packages... ');
    if (!shell.exec('npm install', {silent:true})) {
      console.log('FAILED');
      console.log('"npm install" failed');
      process.exit(1);
    }
    console.log('OK');

    config = JSON.parse(shell.cat('./config.json'));

    // Next step
    bootstrap.getIp();
  }; // copyFiles()
};

// Get public IP
bootstrap.getIp = function() {
  process.stdout.write('Getting public IP of localhost... ');
  common.getPublicIp(function(ip) {
    if (!ip) {
      console.log('FAILED');
      console.log('Please try again.');
      process.exit(1);
    }
    console.log(config.ip = ip);

    bootstrap.checkHooks();
  });
};

// Make sure hooks are not already set
bootstrap.checkHooks = function() {
  process.stdout.write('Getting existing Github hooks... ');
  request.get(githubHooksUrl, function(err, res, body) {
    if (err || res.statusCode !== 200) {
      console.log('FAILED');
      console.log();

      if (res && res.statusCode === 404)
        console.log('Repo does not exist or repo access forbidden. You need admin privileges to setup Botio.');

      if (res && res.statusCode === 401)
        console.log('Bad Github credentials');

      process.exit(1);
    }

    console.log('OK');
    bootstrap.saveConfig();

    // Check if hooks already exist
    body = JSON.parse(body);
    body.forEach(function(hook) {
      if (hook.active && 
          hook.name === 'web' &&
          hook.config && hook.config.url && hook.config.url.indexOf(config.ip) > -1) {
        console.log();
        console.log('Hooks already set up for this IP');
        process.exit(0);
      }
    });

    // If here, we need new hooks
    bootstrap.setupHooks();
  });
};

// Save config to file
bootstrap.saveConfig = function() {
  config.repo = global.repo;
  config.port = global.port;
  config.whitelist = [global.user];
  JSON.stringify(config, null, 2).to('config.json');
}

// Set up hooks
bootstrap.setupHooks = function() {
  var payload = {
    name: 'web',
    active: true,
    events: [
      'push',
      'pull_request',
      'issue_comment'
    ],
    config: { 
      url: 'http://'+config.ip+':'+global.port,
      content_type: 'json'
    }
  };

  process.stdout.write('Setting up new hooks... ');
  request.post({url:githubHooksUrl, json:payload}, function(err, res, body) {
    if (err || res.statusCode !== 201) {
      console.log('FAILED');
      console.log();

      if (res && res.statusCode === 404)
        console.log('Repo does not exist or repo access forbidden');

      if (res && res.statusCode === 401)
        console.log('Bad Github credentials');

      process.exit(1);
    }

    console.log('OK');
    process.exit(0);
  }); // request.post
}

bootstrap.copyFiles();
