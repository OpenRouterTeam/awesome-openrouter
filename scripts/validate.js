#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const APPS_DIR = path.join(__dirname, '..', 'apps');
const SCHEMA_PATH = path.join(__dirname, '..', 'schema', 'app.schema.json');
const APP_DIR_PATTERN = /^[a-z0-9-]+$/;

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const validate = ajv.compile(schema);

function validateApp(appDir) {
  const errors = [];
  const appPath = path.join(APPS_DIR, appDir);

  // Check app directory name
  if (!APP_DIR_PATTERN.test(appDir)) {
    errors.push(
      `Invalid app directory name: ${appDir}. Directory names must contain only lowercase letters, numbers, and hyphens`,
    );
  }

  // Check directory exists
  if (!fs.existsSync(appPath)) {
    errors.push(`Directory does not exist: ${appDir}`);
    return errors;
  }

  // Check app.yaml exists
  const yamlPath = path.join(appPath, 'app.yaml');
  if (!fs.existsSync(yamlPath)) {
    errors.push(`Missing app.yaml in ${appDir}`);
    return errors;
  }

  // Parse and validate YAML
  let app;
  try {
    const content = fs.readFileSync(yamlPath, 'utf8');
    app = yaml.load(content);
  } catch (err) {
    errors.push(`Invalid YAML in ${appDir}: ${err.message}`);
    return errors;
  }

  // Validate against schema
  const valid = validate(app);
  if (!valid) {
    for (const error of validate.errors) {
      errors.push(`${appDir}: ${error.instancePath} ${error.message}`);
    }
  }

  // Check logo.png exists
  const logoPath = path.join(appPath, 'logo.png');
  if (!fs.existsSync(logoPath)) {
    errors.push(`Missing logo.png in ${appDir}`);
  } else {
    // Basic check that it's a valid PNG (starts with PNG signature)
    const buffer = fs.readFileSync(logoPath);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngSignature)) {
      errors.push(`Invalid PNG file in ${appDir}: logo.png is not a valid PNG`);
    }
  }

  // Validate date format
  if (app.date_added) {
    const date = new Date(app.date_added);
    if (isNaN(date.getTime())) {
      errors.push(`${appDir}: Invalid date_added format`);
    }
  }

  return errors;
}

function main() {
  const appDirs = process.argv.slice(2);

  // If no specific dirs provided, validate all
  const dirsToValidate = appDirs.length > 0
    ? appDirs
    : fs.readdirSync(APPS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

  let hasErrors = false;

  for (const dir of dirsToValidate) {
    console.log(`Validating ${dir}...`);
    const errors = validateApp(dir);

    if (errors.length > 0) {
      hasErrors = true;
      for (const error of errors) {
        console.error(`  ❌ ${error}`);
      }
    } else {
      console.log(`  ✅ Valid`);
    }
  }

  if (hasErrors) {
    console.error('\nValidation failed');
    process.exit(1);
  } else {
    console.log('\nAll validations passed');
  }
}

main();
