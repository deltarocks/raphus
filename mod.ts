#!/usr/bin/env -S deno run --allow-read --allow-write=dist --allow-env --allow-run=deno
import ts from "typescript";
import {
	type PluginItem,
	type PluginObject,
	transformFileAsync,
	types as t,
} from "@babel/core";
import decorators from "@babel/plugin-proposal-decorators";
import reactJsx from "@babel/plugin-transform-react-jsx";
import typescript from "@babel/preset-typescript";
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
import { basename, dirname, join, normalize, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const out = join(root, "dist");
const manifestText = await readFile(join(root, "package.json"), "utf8");
const pkg = JSON.parse(manifestText);

const exists = (path: string) => stat(path).then((s) => s, () => undefined);
const isSource = (file: string) =>
	/\.[cm]?tsx?$/.test(file) && !/\.d\.[cm]?ts$/.test(file);
const isScript = (file: string) => /\.[cm]?[jt]sx?$/.test(file);
const emitted = (file: string) =>
	file.replace(/\.(c|m)?tsx?$/, (_, m = "") => `.${m}js`);
const declared = (file: string) =>
	file.replace(/\.(c|m)?tsx?$/, (_, m = "") => `.d.${m}ts`);
const isRelative = (spec: string) => /^\.{1,2}\//.test(spec);
const toJs = (spec: string) =>
	isRelative(spec) && isSource(spec) ? emitted(spec) : spec;

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

const STYLE_REFS = [
	/@import\s+(?:url\(\s*)?["']?(\.{1,2}\/[^"')\s]+)/g,
	/url\(\s*["']?(\.{1,2}\/[^"')\s]+)["']?\s*\)/g,
];

const isImportMeta = (node: ts.Node, name: string) =>
	ts.isPropertyAccessExpression(node) && ts.isMetaProperty(node.expression) &&
	node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
	node.name.text === name;

function specifier(node: ts.Node): ts.Node | undefined {
	if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
		return node.moduleSpecifier;
	}
	if (ts.isExternalModuleReference(node)) return node.expression;
	if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
		return node.argument.literal;
	}
	if (ts.isCallExpression(node)) {
		const callee = node.expression;
		if (
			callee.kind === ts.SyntaxKind.ImportKeyword ||
			isImportMeta(callee, "resolve") ||
			(ts.isIdentifier(callee) && callee.text === "require")
		) return node.arguments[0];
	}
	if (
		ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
		node.expression.text === "URL" && node.arguments?.length === 2 &&
		isImportMeta(node.arguments[1], "url")
	) return node.arguments[0];
}

function specifiers(file: ts.SourceFile): ts.StringLiteralLike[] {
	const found: ts.StringLiteralLike[] = [];
	const visit = (node: ts.Node) => {
		const spec = specifier(node);
		if (spec && ts.isStringLiteralLike(spec)) found.push(spec);
		ts.forEachChild(node, visit);
	};
	visit(file);
	return found;
}

function rewrite<T extends ts.SourceFile | ts.Bundle>(
	context: ts.TransformationContext,
) {
	return (node: T): T => {
		if (!ts.isSourceFile(node)) return node;
		const targets = new Set<ts.Node>(
			specifiers(node).filter((spec) => toJs(spec.text) !== spec.text),
		);
		if (!targets.size) return node;
		const visit = (child: ts.Node): ts.Node =>
			targets.has(child)
				? ts.factory.createStringLiteral(
					toJs((child as ts.StringLiteralLike).text),
				)
				: ts.visitEachChild(child, visit, context);
		return ts.visitEachChild(node, visit, context) as T;
	};
}

const isMeta = (node: t.Node, name: string) =>
	t.isMemberExpression(node) && t.isMetaProperty(node.object) &&
	node.object.meta.name === "import" && t.isIdentifier(node.property, { name });

const rewriteLiteral = (node: t.Node | null | undefined) => {
	if (t.isStringLiteral(node)) node.value = toJs(node.value);
};

const rewriteImports = (): PluginObject => ({
	visitor: {
		ImportOrExportDeclaration({ node }) {
			if ("source" in node) rewriteLiteral(node.source);
		},
		ImportExpression(path) {
			rewriteLiteral(path.node.source);
		},
		CallExpression({ node }) {
			if (
				isMeta(node.callee, "resolve") ||
				t.isIdentifier(node.callee, { name: "require" })
			) rewriteLiteral(node.arguments[0]);
		},
		NewExpression({ node }) {
			if (
				t.isIdentifier(node.callee, { name: "URL" }) &&
				node.arguments.length === 2 && isMeta(node.arguments[1], "url")
			) rewriteLiteral(node.arguments[0]);
		},
	},
});

function refs(file: string, text: string): string[] {
	if (file.endsWith(".css")) {
		return STYLE_REFS.flatMap((re) => [...text.matchAll(re)].map((m) => m[1]));
	}
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest);
	return [
		...specifiers(source).map((spec) => spec.text),
		...[...source.referencedFiles, ...source.typeReferenceDirectives]
			.map((ref) => ref.fileName),
	].filter(isRelative);
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

const jsxPlugins: PluginItem[] = jsOptions.jsx === ts.JsxEmit.Preserve ? [] : [[
	reactJsx,
	jsOptions.jsx === ts.JsxEmit.React
		? {
			runtime: "classic",
			pragma: jsOptions.jsxFactory,
			pragmaFrag: jsOptions.jsxFragmentFactory,
		}
		: { runtime: "automatic", importSource: jsOptions.jsxImportSource },
]];

async function transpile(file: string) {
	const result = await transformFileAsync(join(root, file), {
		configFile: false,
		babelrc: false,
		browserslistConfigFile: false,
		sourceType: "module",
		sourceMaps: true,
		sourceFileName: basename(file),
		parserOpts: { plugins: ["deferredImportEvaluation"] },
		presets: [typescript],
		plugins: [
			[decorators, { version: "2023-11" }],
			...(/\.[cm]?[jt]sx$/.test(file) ? jsxPlugins : []),
			rewriteImports,
		],
	});
	if (result?.code == null || !result.map) {
		throw new Error(`${file}: babel returned no output`);
	}
	return {
		code: `${result.code}\n//# sourceMappingURL=${
			basename(emitted(file))
		}.map\n`,
		map: JSON.stringify(result.map),
	};
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
	const { code, map } = await transpile(file);
	await writeFile(emitted(target), code);
	await writeFile(`${emitted(target)}.map`, map);
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
		ts.sys.writeFile(target, text);
	},
	undefined,
	true,
	{ afterDeclarations: [rewrite] },
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
	isSource(file)
		? [emitted(file), `${emitted(file)}.map`, declared(file)]
		: [file]
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
