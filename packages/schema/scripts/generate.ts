// Generates TypeScript types and Ajv standalone validators from schemas/*.schema.json.
// The schemas are authoritative; CI reruns this script and fails if the output differs.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type SchemaObject } from "ajv/dist/2020.js";
import standalone from "ajv/dist/standalone/index.js";
import { compile, type JSONSchema } from "json-schema-to-typescript";
import { format, resolveConfig } from "prettier";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = join(root, "schemas");
const outDir = join(root, "generated");

function banner(source: string): string {
  return `// Generated from schemas/${source} by scripts/generate.ts. Do not edit.`;
}

async function write(
  path: string,
  source: string,
  parser: "typescript" | "babel",
): Promise<void> {
  const options = await resolveConfig(path);
  writeFileSync(path, await format(source, { ...options, parser }));
}

mkdirSync(outDir, { recursive: true });
const files = readdirSync(schemaDir)
  .filter((file) => file.endsWith(".schema.json"))
  .sort();

for (const file of files) {
  const name = file.slice(0, -".schema.json".length);
  const schema = JSON.parse(
    readFileSync(join(schemaDir, file), "utf8"),
  ) as JSONSchema & SchemaObject;
  const typeName: unknown = schema.title;
  if (typeof typeName !== "string" || !/^[A-Z][A-Za-z0-9]*$/.test(typeName)) {
    throw new Error(`${file}: "title" must be a PascalCase type name`);
  }

  const types = await compile(schema, typeName, {
    bannerComment: banner(file),
    additionalProperties: false,
    format: false,
  });

  const ajv = new Ajv2020({
    code: { source: true, esm: true },
    strict: true,
    allErrors: true,
  });
  // Ajv is CommonJS; under nodenext its default export is the module object.
  const validator = standalone.default(ajv, ajv.compile(schema));
  // Self-contained validators keep Ajv a build-time dependency only.
  if (/\brequire\(|^\s*import\s/m.test(validator)) {
    throw new Error(
      `${file}: validator needs Ajv runtime helpers; use "pattern" instead of minLength/maxLength/format`,
    );
  }

  const declaration = [
    banner(file),
    `import type { ${typeName} } from "./${name}.ts";`,
    `export declare const validate: ((data: unknown) => data is ${typeName}) & { errors?: unknown[] | null };`,
    `export default validate;`,
  ].join("\n");

  await write(join(outDir, `${name}.ts`), types, "typescript");
  await write(
    join(outDir, `${name}.validate.js`),
    `${banner(file)}\n${validator}`,
    "babel",
  );
  await write(join(outDir, `${name}.validate.d.ts`), declaration, "typescript");
}
