const app = require('./app')
const connectDB = require('./config/db');
const chalk = require('chalk');
const logger = require('./utils/logger');

connectDB();

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
// console.log(`
// ${chalk.bgBlue.white.bold('   SERVER STARTED  ')}
// ${chalk.green('Listening on port:')} ${chalk.yellow.bold(PORT)}`);
// logger.info(`Server started on port ${PORT}`);
// });

module.exports=app