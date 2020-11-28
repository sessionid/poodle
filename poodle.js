const { createReadStream, createWriteStream, promises: { mkdir, writeFile, readFile } } = require('fs');
const { join } = require('path');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const got = require('got');
const readline = require('readline');
const { got: options } = require('./config');
const EventEmitter = require('events');
const { execuator: Execuator, helper: { fs: { combine, rmdir, isDir } } } = require('sessionid-windy');
const Task = require('sessionid-windy/lib/execuator/task');

class Poodle extends EventEmitter {
    constructor(src, {
        local = true,
        dest = join('./', String(Date.now())),
        cacheDir = join('./', String(Date.now())),
        base = '',
        thread = 4,
        retryLimit = 5,
        shuffle = false,
        timeout = 1000,
    } = {}) {
        super();
        this.blockIdx = 0;
        this.dest = dest;
        this.cacheDir = cacheDir;
        this._param = { src, local, dest, cacheDir, base, thread, retryLimit, shuffle, timeout };
        this._options = { ...options, timeout };
        this._after = this._after.bind(this);
        this._log = this._log.bind(this);
        this._onDataListener = this._onDataListener.bind(this);
        this._onErrorListener = this._onErrorListener.bind(this);
        this._onFinishListener = this._onFinishListener.bind(this);
        this._onOnceErrorListener = this._onOnceErrorListener.bind(this);
        this._execuatorOptions = [this._downloader.bind(this), { thread, retryLimit, shuffle }];
        this._m3u8Options = [src, { local, base }];
        /* the partical file list */
        this.fileList = [];
        this.errList = [];
        this.m3u8List = [];
    }

    _onDataListener(task) {
        const { m3u8List, fileList, _log } = this;
        this.emit('data', { current: task.tag, total: m3u8List.length, complete: fileList.length });
        fileList.push(task);
        _log();
    }

    _onOnceErrorListener(tag) {
        this.emit('onceerr', tag);
    }

    _onErrorListener(task) {
        this.errList.push(task);
        this._log();
    }

    _onFinishListener() {
        const { errList, _log } = this;
        if (errList.length) {
            _log();
            this.emit('error', 'log.json');
        } else {
            this._after();
        }
    }

    /* log into file for restoring */
    _log() {
        const { execuator, fileList, errList, _param: param, cacheDir } = this;
        const taskList = execuator.taskList.valueOf();
        writeFile(join(cacheDir, 'log.json'), JSON.stringify({ fileList, errList, taskList, param }));
    }

    pause() {
        this.execuator.sleep();
    }

    stop() {
        this.execuator.kill();
    }

    async load() {
        /* convert the m3u8 playlist to uri list */
        const { _m3u8Options } = this;
        this.m3u8List = await this.parseList(..._m3u8Options);
        return this;
    }

    async start() {
        if (this.execuator) {
            this.execuator.awake();
        } else {
            const { m3u8List, _execuatorOptions, _onDataListener, _onOnceErrorListener, _onErrorListener, _onFinishListener, _log, cacheDir } = this;
            /* create the cache directory */
            if (!(await isDir(cacheDir))) await mkdir(cacheDir);
            /* create and start the engine */
            const execuator = new Execuator(..._execuatorOptions);
            execuator.addTask(m3u8List);
            execuator.on('data', _onDataListener);
            execuator.on('error', _onErrorListener);
            execuator.on('onceerr', _onOnceErrorListener);
            execuator.on('finish', _onFinishListener);
            execuator.on('interrupt', () => {
                _log();
                this.emit('stop');
            });
            execuator.on('sleep', () => {
                _log();
                this.emit('pause');
            });
            this.execuator = execuator;
            this.execuator.awake();
        }
        this.emit('start', this.m3u8List.length);
    }

    async _after() {
        const { fileList, dest, cacheDir } = this;
        const list = fileList.sort((a, b) => a.tag - b.tag).map(t => t.data);
        /* combine the file */
        await combine(list, dest);
        /* delete the cache list */
        await rmdir(cacheDir);
        this.emit('finish', dest);
    }

    async _downloader(url) {
        const dest = join(this.cacheDir, `${this.blockIdx++}`);
        await pipeline(
            got.stream(url, this._options),
            createWriteStream(dest),
        );
        return dest;
    }

    parseList(src, { base, local = true } = {}) {
        const input = local ? createReadStream(src) : got.stream(src, options);
        const rl = readline.createInterface({ input });
        const realBase = base ? base : src.slice(0, src.lastIndexOf('/') + 1);
        const result = [];
        rl.on('line', url => url && url[0] !== '#' && result.push(new URL(url, realBase).toString()));

        return new Promise((res, rej) => {
            rl.on('error', rej);
            rl.on('close', res.bind(null, result));
        });
    };

    static async restore(path, options = {}) {
        const { fileList, errList, taskList, param } = JSON.parse(await readFile(path, { encoding: 'utf8' }));
        const poodle = new this('', { ...param, ...options });
        fileList.forEach(task => {
            task.data = task._data;
            poodle.fileList.push(task);
        });
        errList.concat(taskList).forEach(task => poodle.m3u8List.push(new Task(task._payload, task.tag)));
        return poodle;
    }
}

module.exports = Poodle;
