const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ?
            walk(dirPath, callback) : callback(path.join(dir, f));
    });
}

walk(path.join(process.cwd(), 'src', 'components'), (filePath) => {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let original = content;

        // Replace all instances of @/app/ spreading to actions
        content = content.replace(/@\/app\/agents\/actions/g, "@/app/(dashboard)/agents/actions");
        content = content.replace(/@\/app\/apps\/actions/g, "@/app/(dashboard)/apps/actions");
        content = content.replace(/@\/app\/channels\/actions/g, "@/app/(dashboard)/channels/actions");
        content = content.replace(/@\/app\/companies\/actions/g, "@/app/(dashboard)/companies/actions");
        content = content.replace(/@\/app\/invoices\/actions/g, "@/app/(dashboard)/invoices/actions");
        content = content.replace(/@\/app\/products\/actions/g, "@/app/(dashboard)/products/actions");

        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Fixed:', filePath);
        }
    }
});
