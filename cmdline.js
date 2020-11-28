const { BlockProgress, CONSTANTS: { BACKGROUND } } = require('sessionid-fly');

const parseArgs = (argv) => {
    const cache = [];
    const map = argv.slice(2).reverse().reduce((ret, item) => {
        if (item.startsWith('-')) {
            ret[item.replace(/^-*/, '')] = cache.length > 1 ? cache.splice(0) : cache.pop();
        } else {
            cache.push(item);
        }
        return ret;
    }, {});
    return { map, flat: cache };
};


module.exports = async (argv) => {
    const argMap = parseArgs(argv);
    const { ipc: { channel, encoding } } = require('./config');
    const { join } = require('path');
    const net = require('net');
    const Poodle = require('./poodle');

    const tip = `
poodle <src> -b <base> -d <path> -c <cacheDirectory> 本地下载 m3u8
poodle <uri> -r -b <base> -d <path> -c <cacheDirectory> 下载远程 m3u8
poodle <src> -restore 恢复下载
poodle -a start 开始下载
poodle -a pause 暂停下载
poodle -a stop 停止下载 `;
    if (argMap.flat.length) {
        if ('restore' in argMap.map) {
            Poodle.restore(argMap.flat[0]).then(createService).catch(console.error);
        } else {
            // 创建下载
            const options = {
                local: !('r' in argMap.map),
                dest: argMap.map.d || join('./', String(Date.now())),
                cacheDir: argMap.map.c || join('./', String(Date.now())),
                base: argMap.map.b || '',
                thread: 16,
                retryLimit: 5,
                shuffle: true,
                timeout: 180000,
            };
            const poodle = new Poodle(argMap.flat[0], options);
            poodle.load().then(createService).catch(console.error);
        }
        function createService(poodle) {
            const alert = (type = '', conn) => {
                return new Promise((res, rej) => {
                    conn.write(`succ execuate ${type}`, (err) => err ? rej(err) : res());
                })
            };
            const server = net.createServer();
            let socket;
            server.on('connection', (conn) => {
                conn.setEncoding(encoding);
                conn.on("data", (sig) => {
                    const { action, payload } = JSON.parse(sig);
                    if (action === 'start') {
                        poodle.start();
                    } else if (action === 'pause') {
                        poodle.pause();
                    } else if (action === 'stop') {
                        poodle.stop();
                    } else {
                        conn.write('invalid action');
                    }
                });
                socket = conn;
            });

            const blockProgress = new BlockProgress(70, [ BACKGROUND.WHITE, BACKGROUND.GREEN, BACKGROUND.RED ]);

            poodle.on('data', ({ current: blockId }) => {
                blockProgress.update(blockId, 1);
            });

            poodle.on('onceerr', (blockId) => {
                blockProgress.update(blockId, 2);
            });

            /* 绑定事件响应 */
            poodle.on('start', (total) => { 
                socket && alert('start', socket).catch(console.error);
                blockProgress.init(total);
            });
            poodle.on('pause', () => { alert('pause', socket).catch(console.error); });
            poodle.on('stop', () => {
                alert('stop', socket).catch(console.error).finally(() => {
                    blockProgress.end();
                    server.close();
                });
            });
            poodle.on('error', (e) => {
                blockProgress.end();
                server.close(e => {
                    if (e) {
                        console.log(e);
                    } else {
                        console.log(`未完成下载, 错误日志文件:${e}`);
                    }
                });
            });
            poodle.on('finish', (filePath) => {
                server.close(e => {
                    if (e) {
                        console.log(e);
                    } else {
                        console.log(`完成下载, 文件路径:${filePath}`);
                    }
                });
            });


            server.listen(channel, () => {
                /* 开始下载 */
                console.log('开始下载');
                poodle.start();
            });
        }
    } else if (argMap.map.a) {
        // 执行动作, 发送操作信息
        const action = argMap.map.a;
        const conn = net.createConnection(channel, () => {
            conn.write(JSON.stringify({ action, payload: [] }));
        });
        conn.setEncoding(encoding);
        conn.on("data", (data) => {
            console.log(data);
            conn.end();
        });
    } else {
        // 只是键入了命令, 没有提供任何参数
        console.log(tip);
    }
}
