if (require.main === module) {
    require('./cmdline')(process.argv);
} else {
    module.exports = require('./poodle');
}
