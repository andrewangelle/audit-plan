import { readFileSync, writeFileSync } from 'node:fs';

const pluginManifestPath = new URL('../plugin/.claude-plugin/plugin.json', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const manifest = readFileSync(pluginManifestPath, 'utf8');
const versionField = /("version"\s*:\s*)"[^"]*"/;

if (!versionField.test(manifest)) {
  throw new Error(`No "version" field found in ${pluginManifestPath.pathname}`);
}

// Replace in place rather than re-serializing so the manifest's formatting is preserved
writeFileSync(pluginManifestPath, manifest.replace(versionField, `$1"${version}"`));
console.log(`Synced plugin.json version to ${version}`);
