# sUploadServer
Simple Upload Server - small Node.js based project, that allows to upload files throw https

# Installation

Clone repository
```
git clone https://github.com/StuxForce/sUploadServer.git
```

Install modules in project folder
```
npm install
```

Rename **./config/default.json.sample** into **default.json**

Create Private Key and Certificate and put them to **./pki/server.key** and **./pki/server.crt** or set path in **default.json**

Change server options like *port*, *ip*, *uploadTmpDir* (for temporality files), *uploadMainDir* (for main files)

Add *tokens* and *dirs* (dir is subdirectory of uploadMainDir)

Run 
```
node server.js
```

# Usage

You can upload file from client like
```
curl -H "x-token:<auth_token>" [-H "x-md5:<md5hash_for_check>"] [-H "x-subdir:<subdir_on_server>"] [-H "x-ttl:<time_to_live_for_file_in_days>"] -F "ufile=@<some_file>" -k https://ip:port/
```
**<auth_token>** - access toket defined in ./config/default.json

**<md5hash_for_check>** - client side calculated md5 for uploading file (for check at server side, if needed)

**<subdir_on_server>** - subdir for uploading file on server side, if needed

**<time_to_live_for_file_in_days>** - keep file on server for these count of days. Default is 0 (no remove file)

**<some_file>** - path to uploading file
