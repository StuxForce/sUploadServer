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
