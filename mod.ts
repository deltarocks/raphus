#!/usr/bin/env -S deno run --allow-read --allow-write=dist,package.json --allow-env --allow-run=deno
import ts from "typescript";
import { execFileSync } from "node:child_process";
import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, join, normalize, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const out = join(root, "dist");
const manifestText = await readFile(join(root, "package.json"), "utf8");
const pkg = JSON.parse(manifestText);

if (process.argv[2] === "init") {
	if (pkg.private) {
		console.log(`${pkg.name ?? root}: private, skipped`);
		process.exit(0);
	}
	pkg.scripts = { ...pkg.scripts, prepack: "pnpm-prepare" };
	pkg.publishConfig = {
		...pkg.publishConfig,
		directory: "dist",
		linkDirectory: false,
	};
	const indent = /\n([ \t]+)"/.exec(manifestText)?.[1] ?? "\t";
	await writeFile(
		join(root, "package.json"),
		JSON.stringify(pkg, null, indent) + "\n",
	);
	console.log(`${pkg.name}: publishConfig written`);
	process.exit(0);
}

const exists = (path: string) => stat(path).then((s) => s, () => undefined);
const isSource = (file: string) =>
	/\.[cm]?tsx?$/.test(file) && !/\.d\.[cm]?ts$/.test(file);
const isScript = (file: string) => /\.[cm]?[jt]sx?$/.test(file);
const emitted = (file: string) =>
	file.replace(/\.(c|m)?tsx?$/, (_, m = "") => `.${m}js`);
const declared = (file: string) =>
	file.replace(/\.(c|m)?tsx?$/, (_, m = "") => `.d.${m}ts`);
const toJs = (text: string, pattern: RegExp) =>
	text.replace(pattern, (_, spec, m = "", end) => `${spec}.${m}js${end}`);

async function configOptions(): Promise<ts.CompilerOptions> {
	for (let dir = root;; dir = dirname(dir)) {
		for (const name of ["tsconfig.json", "deno.json", "deno.jsonc"]) {
			const file = join(dir, name);
			if (!(await exists(file))?.isFile()) continue;
			const { config } = ts.parseConfigFileTextToJson(
				file,
				await readFile(file, "utf8"),
			);
			const { jsx = "react-jsx", lib, ...rest } = config?.compilerOptions ?? {};
			return ts.convertCompilerOptionsFromJson({
				jsx,
				jsxImportSource: rest.jsxImportSource,
				jsxFactory: rest.jsxFactory,
				jsxFragmentFactory: rest.jsxFragmentFactory,
				lib: lib?.filter((l: string) => !l.startsWith("deno.")),
			}, dir).options;
		}
		if (dirname(dir) === dir) return { jsx: ts.JsxEmit.ReactJSX };
	}
}

const jsOptions: ts.CompilerOptions = {
	module: ts.ModuleKind.ESNext,
	target: ts.ScriptTarget.ESNext,
	rewriteRelativeImportExtensions: true,
	...(await configOptions()),
};

const URL_REFS =
	/(new URL\(\s*["']\.{1,2}\/[^"']+?|import\.meta\.resolve\(\s*["']\.{1,2}\/[^"']+?)\.(c|m)?tsx?(["'])/g;
const IMPORT_REFS =
	/((?:from|import)\s*\(?\s*["']\.{1,2}\/[^"']+?)\.(c|m)?tsx?(["'])/g;
const STYLE_REFS = [
	/@import\s+(?:url\(\s*)?["']?(\.{1,2}\/[^"')\s]+)/g,
	/url\(\s*["']?(\.{1,2}\/[^"')\s]+)["']?\s*\)/g,
];

function refs(file: string, text: string): string[] {
	const info = ts.preProcessFile(text, true, true);
	const found = file.endsWith(".css")
		? STYLE_REFS.flatMap((re) => [...text.matchAll(re)].map((m) => m[1]))
		: [
			...info.importedFiles,
			...info.referencedFiles,
			...info.typeReferenceDirectives,
		].map((f) => f.fileName).concat(
			[...text.matchAll(
				/(?:new URL\(|import\.meta\.resolve\()\s*["'](\.{1,2}\/[^"']+)["']/g,
			)].map((m) => m[1]),
		);
	return found.filter((spec) => /^\.{1,2}\//.test(spec));
}

function strings(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (value && typeof value === "object") {
		return Object.values(value).flatMap(strings);
	}
	return [];
}

async function expand(entry: string): Promise<string[]> {
	if (!(await exists(join(root, entry)))?.isDirectory()) return [entry];
	const files = await readdir(join(root, entry), { recursive: true });
	const found = [];
	for (const file of files) {
		const path = join(entry, file);
		if ((await exists(join(root, path)))?.isFile()) found.push(path);
	}
	return found;
}

const errors: string[] = [];
const reachable = new Set<string>();
const queue = [
	...strings([pkg.exports, pkg.bin]),
	...(await Promise.all((pkg.files ?? []).map(expand))).flat(),
].map((entry) => normalize(entry));
while (queue.length) {
	const file = queue.shift()!;
	if (reachable.has(file)) continue;
	if (file.startsWith("..")) {
		errors.push(`outside of package: ${file}`);
		continue;
	}
	if (!(await exists(join(root, file)))?.isFile()) {
		errors.push(`missing ${file}`);
		continue;
	}
	reachable.add(file);
	const types = file.replace(/\.(c|m)?js$/, (_, m = "") => `.d.${m}ts`);
	if (types !== file && (await exists(join(root, types)))?.isFile()) {
		reachable.add(types);
	}
	if (!isScript(file) && !file.endsWith(".css")) continue;
	const text = await readFile(join(root, file), "utf8");
	for (const spec of refs(file, text)) {
		queue.push(normalize(join(dirname(file), spec)));
	}
}

await rm(out, { recursive: true, force: true });
const sources = [...reachable].filter(isSource);
console.log("Reachable:", reachable);
for (const file of reachable) {
	const target = join(out, file);
	await mkdir(dirname(target), { recursive: true });
	if (!isSource(file)) {
		await copyFile(join(root, file), target);
		continue;
	}
	const js = ts.transpileModule(await readFile(join(root, file), "utf8"), {
		compilerOptions: jsOptions,
		fileName: file,
	});
	await writeFile(emitted(target), toJs(js.outputText, URL_REFS));
}

function denoTypes(): string | undefined {
	try {
		return execFileSync("deno", ["types"], { encoding: "utf8" });
	} catch {
		return undefined;
	}
}

const dtsOptions: ts.CompilerOptions = {
	...jsOptions,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	allowImportingTsExtensions: true,
	resolveJsonModule: true,
	declaration: true,
	emitDeclarationOnly: true,
	noCheck: true,
	skipLibCheck: true,
};
const host = ts.createCompilerHost(dtsOptions);
const denoLib = join(root, "__deno_types__.d.ts");
const denoText = denoTypes();
const rootNames = sources.map((file) => join(root, file));
if (denoText !== undefined) {
	rootNames.push(denoLib);
	const { getSourceFile, fileExists } = host;
	host.fileExists = (file) => file === denoLib || fileExists(file);
	host.getSourceFile = (file, version, ...rest) =>
		file === denoLib
			? ts.createSourceFile(file, denoText, version)
			: getSourceFile(file, version, ...rest);
}
const expected = new Set(sources.map((file) => join(root, declared(file))));
const result = ts.createProgram({ rootNames, options: dtsOptions, host }).emit(
	undefined,
	(file, text) => {
		if (!expected.has(file)) return;
		const target = join(out, relative(root, file));
		ts.sys.writeFile(target, toJs(text, IMPORT_REFS));
	},
	undefined,
	true,
);
if (result.diagnostics.length) {
	errors.push(
		ts.formatDiagnostics(result.diagnostics, {
			getCanonicalFileName: (f) => f,
			getCurrentDirectory: () => root,
			getNewLine: () => "\n",
		}).trimEnd(),
	);
}

function publish(value: unknown): unknown {
	if (typeof value === "string") {
		return isSource(value)
			? { types: declared(value), default: emitted(value) }
			: value;
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, publish(v)]),
		);
	}
	return value;
}

const manifest = { ...pkg, exports: publish(pkg.exports) };
if (typeof pkg.bin === "string") manifest.bin = emitted(pkg.bin);
else if (pkg.bin) {
	manifest.bin = Object.fromEntries(
		Object.entries(pkg.bin).map(([k, v]) => [k, emitted(v as string)]),
	);
}
delete manifest.scripts;
delete manifest.devDependencies;
manifest.files = [...reachable].flatMap((file) =>
	isSource(file) ? [emitted(file), declared(file)] : [file]
).sort();
manifest.publishConfig = { ...pkg.publishConfig };
delete manifest.publishConfig.directory;
delete manifest.publishConfig.linkDirectory;
if (!Object.keys(manifest.publishConfig).length) delete manifest.publishConfig;
await writeFile(
	join(out, "package.json"),
	JSON.stringify(manifest, null, 2) + "\n",
);

if (errors.length) {
	console.error(errors.join("\n"));
	process.exit(1);
}
console.log(`${pkg.name}: ${reachable.size} files -> ${relative(root, out)}`);
