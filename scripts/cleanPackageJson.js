const fs = require('fs');
const packageJson = require('../package.json');

delete packageJson.scripts;
delete packageJson.devDependencies;

fs.writeFileSync('./package.json', JSON.stringify(packageJson));
