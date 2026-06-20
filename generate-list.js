const fs = require('fs');
const path = require('path');

// Adjust 'public/apps' if your apps folder is structured differently
const appsDir = path.join(__dirname, 'public', 'apps');
const outputDir = path.join(__dirname, 'public');

// Ensure the public directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Read the directory
fs.readdir(appsDir, (err, files) => {
    if (err) {
        console.error('Could not list the directory.', err);
        // Create an empty json so the fetch doesn't crash completely
        fs.writeFileSync(path.join(outputDir, 'apps-list.json'), JSON.stringify([]));
        process.exit(0); 
    }

    // Filter only HTML files
    const htmlFiles = files.filter(file => file.endsWith('.html'));

    // Write the list to apps-list.json
    fs.writeFileSync(
        path.join(outputDir, 'apps-list.json'),
        JSON.stringify(htmlFiles, null, 2)
    );
    
    console.log('Successfully generated apps-list.json with:', htmlFiles);
});
