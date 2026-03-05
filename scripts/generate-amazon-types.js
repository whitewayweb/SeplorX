#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "../src/lib/channels/amazon/api/types");
if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function main() {
    console.log("Fetching list of API models from Amazon SP-API repository...");
    const res = await fetch("https://api.github.com/repos/amzn/selling-partner-api-models/git/trees/main?recursive=1");
    const data = await res.json();

    if (!data.tree) {
        console.error("Failed to fetch repository tree. Response:", data);
        process.exit(1);
    }

    // Only generate types for the APIs we actually use to prevent codebase bloat
    const ALLOWED_MODELS = [
        "catalog-items-api-model",
        "listings-items-api-model",
        "product-type-definitions-api-model",
        "sellers-api-model",
        "reports-api-model"
    ];

    // Filter for valid OpenAPI JSON files in the `models/` folder
    const validFiles = data.tree.filter(node => {
        if (node.type !== "blob" || !node.path.startsWith("models/") || !node.path.endsWith(".json")) return false;

        // Clean names
        const parts = node.path.split("/");
        if (parts.length !== 3) return false;

        const modelFolder = parts[1];
        if (!ALLOWED_MODELS.includes(modelFolder)) return false;

        // Ignore internal schemas and tests
        if (
            node.path.includes("/schemas/") ||
            node.path.includes("/tests/") ||
            node.path.includes("/examples/") ||
            node.path.includes("global-schemas")
        ) {
            return false;
        }

        return true;
    });

    console.log(`Found ${validFiles.length} API models to generate...`);

    for (const file of validFiles) {
        const parts = file.path.split("/");
        const moduleName = parts[1].replace("-api-model", "").replace("-model", "");
        const fileNameBase = parts[2].replace(".json", "");

        // Clean names: strip out trailing _YYYY-MM-DD and redundant "definitions" prefix
        let outName = fileNameBase.replace(/_20[0-9]{2}-[0-9]{2}-[0-9]{2}$/, "");
        // Remove "definitions" prefix if it exists (e.g. definitionsProductTypes -> productTypes)
        outName = outName.replace(/^definitions/i, "");
        // Ensure first char is lowercase for the filename
        outName = outName.charAt(0).toLowerCase() + outName.slice(1);

        const outFilePath = path.join(OUT_DIR, `${outName}Schema.ts`);
        const url = `https://raw.githubusercontent.com/amzn/selling-partner-api-models/main/${file.path}`;

        console.log(`-> Generating ${outName}...`);
        try {
            // Adding --version 2 to ensure older Swagger files are properly parsed by openapi-typescript v5
            execSync(`npx --yes openapi-typescript@5 "${url}" -o "${outFilePath}" --version 2`, { stdio: "inherit" });

            // Post-process to rename "definitions" to model-specific PascalCase name
            let content = fs.readFileSync(outFilePath, "utf8");
            const pascalName = outName.charAt(0).toUpperCase() + outName.slice(1);
            const typeAlias = `${pascalName}Schema`;

            content = content.replace(/export interface definitions/g, `export interface ${typeAlias}`);
            // Replace internal references
            content = content.replace(/definitions\[/g, `${typeAlias}[`);
            content += `\nexport default ${typeAlias};\n`;

            fs.writeFileSync(outFilePath, content);
            console.log(`   (Renamed 'definitions' to '${typeAlias}')`);
        } catch (e) {
            console.error(`[X] Failed to generate types for ${file.path}`);
        }
    }

    console.log("\n✅ Done! All Amazon SP-API types have been generated in", OUT_DIR);
}

main().catch(console.error);
