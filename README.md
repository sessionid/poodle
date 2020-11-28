# poodle

m3u8 downloader

`class::Poodle`:

- `constructor(src, { local, dest, cacheDir, base, thread, retryLimit, shuffle, timeout })`
- `#load()`
- `#pause()`
- `#stop()`
- `#start()`
- `#restore()`
- Events:
    - data `({ current, total, complete })`
    - oncerr `(blockId)`
    - error `(logFilePath)`
    - stop
    - pause
    - start `(taskLength)`
    - finish `(dest)`