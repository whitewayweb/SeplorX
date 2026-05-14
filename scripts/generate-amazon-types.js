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
        "reports-api-model",
        "feeds-api-model",
        "orders-api-model",
        "finances-api-model",
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
        const modelFolder = parts[1];
        const fileNameBase = parts[2].replace(".json", "");

        let outName = getOutputName(modelFolder, fileNameBase);
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

function getOutputName(modelFolder, fileNameBase) {
    if (modelFolder === "finances-api-model" && fileNameBase.includes("2024-06-19")) {
        return "finances2024";
    }

    if (modelFolder === "orders-api-model" && fileNameBase.includes("2026-01-01")) {
        return "orders2026";
    }

    // Clean names: strip out trailing _YYYY-MM-DD for models where the current
    // codebase already uses the unversioned name.
    return fileNameBase.replace(/_20[0-9]{2}-[0-9]{2}-[0-9]{2}$/, "");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
