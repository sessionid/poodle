const { join } = require('path');

module.exports = {
    got: {
        headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36 Edg/85.0.564.70'
        },
        retry: 5,
    },
    ipc: {
        encoding: 'utf8',
        channel: process.platform === 'win32' ? join('\\\\?\\pipe', process.cwd(), 'poodle') : join(process.cwd(), 'poodle'),
    }
};