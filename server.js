
/**
 * Simple upload server
 * @author     Denis Pantsyrev <denis.pantsyrev@gmail.com>
 * @copyright  2019 Denis Pantsyrev
 */

const config = require('config');
const https = require('https');
const multiparty = require('multiparty');
const fs = require('fs.extra');
const extfs = require('extfs');
const md5File = require('md5-file');
const log4js = require('log4js');
const sqlite3 = require('sqlite3').verbose();

// Define database
const db = new sqlite3.Database('./database.sqlite');
db.serialize(() => {
	db.run('CREATE TABLE IF NOT EXISTS uplFiles ('
		+ 'droptime VARCHAR(1024),'
		+ 'filename VARCHAR(1024)'
		+ ')');
});

// Defile logger
log4js.configure(config.get('log4js.settings'));
const logger = log4js.getLogger(config.get('log4js.level').toString());

// Start delete old files tasks
setInterval(deleteOldFiles, config.get('server.purgeDelay') * 1000);

// Prepare server settings
const serverOptions = {
	key: fs.readFileSync(config.get('pki.key')),
	cert: fs.readFileSync(config.get('pki.cert')),
	keepAliveTimeout: 300 * 1000,
};

// Define and start server
const server = https.createServer(serverOptions, reqProcessing);
server.listen(config.get('server.port'), config.get('server.ip'));
logger.info(`Server started at ${config.get('server.ip')}:${config.get('server.port')}`);

/**
 * Request processing function
 */
async function reqProcessing(req, res) {
	logger.info(`${req.connection.remoteAddress} Start connection!`);
	try {
		checkHeaders(req);

		const ldata = await Promise.all([parseForm(req), prepareFilePath(req)])
			.catch((reject) => {
				throw new Error(reject.message);
			});

		const srcFile = ldata[0][1];
		const dstFile = ldata[1] + ldata[0][0];
		await moveFile(srcFile, dstFile)
			.catch((reject) => {
				throw new Error(reject.message);
			});

		if (req.headers['x-md5']) {
			await md5Check(req.headers['x-md5'], dstFile)
				.catch((reject) => {
					throw new Error(reject.message);
				});
		}

		setDbData(req.headers['x-ttl'], dstFile);
		closeConnection(req, res, `200:::Upload OK, file '${dstFile}':::Upload OK!`);
	} catch (error) {
		closeConnection(req, res, error.message);
	}
}

/**
 * Check presence and correctness of some headers
 * @param req
 */
function checkHeaders(req) {
	// Check auth header
	if (!req.headers['x-token']
		|| !(req.headers['x-token'] in config.get('tokens'))) {
		throw new Error('400:::Empty or incorrect token header!:::Miss Auth!');
	}

	// Check subdir header
	if (!req.headers['x-subdir']) {
		req.headers['x-subdir'] = '';
	} else if (/\.\./.test(req.headers['x-subdir'])) {
		throw new Error(`400:::Bad subdir header '${req.headers['x-subdir']}'!:::Bad subdir!`);
	}

	// Check ttl header
	if (!req.headers['x-ttl']) {
		req.headers['x-ttl'] = config.get('server.defaultTtl');
	} else if (!/^[0-9]+$/.test(req.headers['x-ttl'])) {
		throw new Error(`400:::Bad ttl header '${req.headers['x-ttl']}'!:::Bad ttl!`);
	}
}

/**
 * Parse form function
 * @param {object} req
 */
function parseForm(req) {
	return new Promise((resolve, reject) => {
		const form = new multiparty.Form({ uploadDir: config.get('server.uploadTmpDir') });
		form.parse(req, (err, fields, files) => {
			if (err) {
				return reject(new Error('400:::Form parse error!:::Form parse error!'));
			}

			if (!files
				|| !files.ufile
				|| !files.ufile[0]
				|| !files.ufile[0].originalFilename
				|| !files.ufile[0].path
			) {
				return reject(new Error('400:::Miss file!:::Miss file!'));
			}
			return resolve([files.ufile[0].originalFilename, files.ufile[0].path]);
		});
	});
}

/**
 * Move file to it's destination folder
 * @param {object} req
 * @param {object} formRes
 */
function prepareFilePath(req) {
	return new Promise((resolve, reject) => {
		const dir = `${config.get('server.uploadMainDir')}/${
			config.get(`tokens.${req.headers['x-token']}.dir`)}/${req.headers['x-subdir']}/`;
		fs.mkdirRecursive(dir, (err) => {
			if (err) {
				return reject(new Error(`500:::Error creating dir '${dir}':::Upload error!`));
			}
			return resolve(dir);
		});
	});
}

/**
 * Move temp file to destination location
 * @param {string} srcFile
 * @param {string} dstFile
 */
function moveFile(srcFile, dstFile) {
	return new Promise((resolve, reject) => {
		fs.move(srcFile, dstFile, (err) => {
			if (err) {
				unlinkFile(srcFile);
				return reject(new Error(`500:::Error moving file '${srcFile}' to '${dstFile}':::Upload error!`));
			}
			return resolve(true);
		});
	});
}

/**
 * Check file md5 hash
 * @param {string} md5
 * @param {string} file
 */
function md5Check(md5, file) {
	return new Promise((resolve, reject) => {
		logger.info(`Start MD5 check for '${file}'`);
		if (md5File.sync(file) !== md5) {
			unlinkFile(file);
			return reject(new Error(`500:::Error checking MD5 for '${file}'!:::MD5 Error!`));
		}
		return resolve(true);
	});
}

/**
 * Remove file
 * @param {string} file
 */
function unlinkFile(file) {
	logger.warn(`Deleting file ${file}!`);
	fs.unlink(file, (err) => {
		if (err) {
			logger.warn(`Error deleting file ${file}!`);
		}
	});
}

/**
 * Close connection
 * @param {object} req
 * @param {object} res
 * @param {string} resDataArr is string with ::: separator like code:::log_message:::client_message
 */
function closeConnection(req, res, resData) {
	const resDataArr = resData.split(':::');
	const code = parseInt(resDataArr[0], 10);
	const logMsg = `${req.connection.remoteAddress} ${resDataArr[1]}`;
	const retMsg = resDataArr[2];
	if (code !== 200) {
		logger.warn(logMsg);
	} else {
		logger.info(logMsg);
	}
	res.writeHead(code);
	res.end(retMsg);
}

/**
 * Set database entries
 * @param {integer} ttl
 * @param {string} filename
 */
function setDbData(ttl, filename) {
	if (ttl === 0) return;
	db.serialize(() => {
		const dropTimeMs = new Date().getTime() + ttl * 86400 * 1000;
		const dropTime = new Date(dropTimeMs).toISOString();

		const stmt = db.prepare('INSERT INTO uplFiles VALUES (?,?)');
		stmt.run(dropTime, filename);
		stmt.finalize();
		logger.info(`Add DB entry: '${filename}' till ${dropTime}`);
	});
}

/**
 * Remove filesystem object
 * @param {string} path
 */
function deleteFsObj(path) {
	return new Promise((resolve, reject) => {
		fs.removeSync(path, (err) => {
			if (err) {
				logger.warn();
				return reject(new Error(`Error deleting '${path}' with error message '${err}'`));
			}
			return resolve(true);
		});
	});
}

/**
 * Delete old uploaded files
 */
function deleteOldFiles() {
	db.each('SELECT * FROM uplFiles', (err, row) => {
		if (row.droptime
			&& row.filename
			&& new Date().toISOString() > row.droptime) {
			logger.info(`Remove old file: '${row.filename}'`);

			// Remove file
			const delres = deleteFsObj(row.filename)
				.catch((reject) => {
					logger.warn(reject.message);
				});

			if (!delres) {
				return;
			}

			// Remove db entry
			db.serialize(() => {
				const stmt = db.prepare('DELETE FROM uplFiles WHERE droptime = ? AND filename = ?');
				stmt.run(row.droptime, row.filename);
				stmt.finalize();
				logger.info(`Remove DB entry: '${row.filename}' till ${row.droptime}`);
			});

			// Remove empty folders in path
			const path = row.filename.substring(0, row.filename.lastIndexOf('/'));
			if (extfs.isEmptySync(path)) {
				deleteFsObj(path)
					.catch((reject) => {
						logger.warn(reject.message);
					});
			}
		}
	});
}
